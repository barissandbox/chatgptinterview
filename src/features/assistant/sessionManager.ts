/** Coordinates assistant lifecycle, capture commands, and answer generation. */
import { EXTENSION_PATHS, getExtensionUrl } from '../../shared/constants';
import { sendTabMessage } from '../../shared/messaging';
import { getStorage } from '../../shared/storage';
import { getErrorMessage } from '../../shared/errors';
import { normalizeDeepgramLanguage } from '../../shared/languages';
import { ensureAuthenticated } from '../auth/loginFlow';
import {
  getAssistantAnswerType,
  getAssistantFastEnabled,
  getAssistantLanguage,
  getAssistantModel,
  getAssistantTargetPosition,
  getAssistantThinkingVariant,
  getAssistantVerbosity
} from '../status/statusBuilder';
import {
  appendConversation,
  clearAssistantState,
  getLatestTranscriptQuestion,
  hasRecentAutoAnswer,
  markAutoAnswer
} from './conversationStore';
import { requestInterviewAnswer } from './answerGenerator';
import { publishAssistantAnswer, publishAssistantStatus } from './uiPublisher';
import { detectInterviewQuestionFromTranscripts } from '../transcription/questionDetector';
import type {
  AssistantAppendTranscriptRequest,
  AssistantDetectQuestionRequest,
  AssistantGenerateRequest,
  AssistantLanguage,
  CaptureMicStartRequest,
  Result,
  TabMessage
} from '../../shared/types';

const OFFSCREEN_DOCUMENT_URL = getExtensionUrl(EXTENSION_PATHS.offscreenDocument);

let activeAssistantTabId: number | null = null;
const inFlightAutoAnswerKeys = new Set<string>();

/** Opens the side panel for the active tab and remembers it for capture commands. */
export async function openAssistant(tab?: chrome.tabs.Tab): Promise<Result> {
  const targetTab = tab || (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (!targetTab?.id) {
    throw new Error('No active tab was available.');
  }
  activeAssistantTabId = targetTab.id;

  await sendTabMessage(targetTab.id, { action: 'assistant.hide' }).catch(() => undefined);
  await openAssistantSidePanel(targetTab.id);

  return { ok: true };
}

/** Stores a finalized transcript message from the microphone or tab-audio recognizer. */
export async function appendTranscript(
  message: AssistantAppendTranscriptRequest
): Promise<Result> {
  const text = message.text.trim();
  if (!text) {
    return { ok: true };
  }

  await appendConversation([{
    role: message.speaker || 'candidate',
    text,
    createdAt: Date.now()
  }]);

  return { ok: true };
}

/** Starts page-level microphone capture by injecting the content script on demand. */
export async function startMicCapture(
  message: CaptureMicStartRequest,
  sender: chrome.runtime.MessageSender
): Promise<Result> {
  const targetTab = sender.tab || await getActiveAssistantTab();
  const tabId = targetTab?.id;
  if (!tabId) {
    throw new Error('No current tab was available for microphone capture.');
  }
  activeAssistantTabId = tabId;

  const { deepgram } = await getStorage('deepgram');
  const apiKey = typeof deepgram?.apiKey === 'string' ? deepgram.apiKey.trim() : '';
  if (!apiKey) {
    throw new Error('Enter and test a Deepgram API key in the extension popup first.');
  }

  await sendTabMessageWithInjection(tabId, {
    action: 'capture.mic.start',
    apiKey,
    language: normalizeLanguage(message.language)
  });

  return { ok: true };
}

/** Stops page-level microphone capture on the active assistant tab. */
export async function stopMicCapture(sender?: chrome.runtime.MessageSender): Promise<Result> {
  const targetTab = sender?.tab || await getActiveAssistantTab();
  const tabId = targetTab?.id;
  if (!tabId) {
    return { ok: true };
  }
  await sendTabMessage(tabId, { action: 'capture.mic.stop' }).catch(() => undefined);
  return { ok: true };
}

/** Starts current-tab audio capture through the MV3 offscreen document. */
export async function startTabAudioCapture(
  message: { language?: AssistantLanguage },
  sender: chrome.runtime.MessageSender
): Promise<Result> {
  const targetTab = sender.tab || await getActiveAssistantTab();
  const tabId = targetTab?.id;
  if (!tabId) {
    throw new Error('No current tab was available for audio capture.');
  }
  activeAssistantTabId = tabId;

  await ensureOffscreenAudioDocument();
  const { deepgram } = await getStorage('deepgram');
  const apiKey = typeof deepgram?.apiKey === 'string' ? deepgram.apiKey.trim() : '';
  if (!apiKey) {
    throw new Error('Enter and test a Deepgram API key in the extension popup first.');
  }

  const streamId = await chrome.tabCapture.getMediaStreamId({
    targetTabId: tabId
  });
  if (!streamId) {
    throw new Error('Chrome did not return a tab audio stream id.');
  }

  const result = await chrome.runtime.sendMessage({
    target: 'offscreen-audio',
    type: 'start-audio',
    streamId,
    tabId,
    apiKey,
    language: normalizeLanguage(message.language)
  }) as Result;

  if (!result.ok) {
    throw new Error(result.error || 'Could not start tab audio.');
  }

  return { ok: true };
}

/** Stops the offscreen tab-audio capture document if it is currently active. */
export async function stopTabAudioCapture(): Promise<Result> {
  const hasDocument = await hasOffscreenAudioDocument();
  if (!hasDocument) {
    return { ok: true };
  }

  await chrome.runtime.sendMessage({
    target: 'offscreen-audio',
    type: 'stop-audio'
  }).catch(() => undefined);

  return { ok: true };
}

/** Generates an answer for an explicit question or the latest transcript question. */
export async function generateAssistantAnswer(
  message: AssistantGenerateRequest,
  sender: chrome.runtime.MessageSender
): Promise<Result> {
  const language = await getAssistantLanguage();
  const question = message.question?.trim() || await getLatestTranscriptQuestion(language);
  if (!question) {
    throw new Error('No transcript question is available yet.');
  }

  const autoAnswerKey = message.source === 'manual' ? '' : reserveAutoAnswer(question);
  if (message.source !== 'manual') {
    if (!autoAnswerKey) {
      return { ok: true };
    }

    if (await hasRecentAutoAnswer(question)) {
      releaseAutoAnswer(autoAnswerKey);
      return { ok: true };
    }
  }

  await generateAnswerForQuestion(question, sender.tab?.id ?? null, autoAnswerKey, language);
  return { ok: true };
}

/** Clears persisted assistant transcript and answer state. */
export async function clearConversation(): Promise<Result> {
  await clearAssistantState();
  return { ok: true };
}

/** Runs local transcript heuristics to decide whether a new interview question exists. */
export async function detectInterviewQuestion(
  message: AssistantDetectQuestionRequest
): Promise<Result<{ isQuestion: boolean; question: string; questions?: string[] }>> {
  return { ok: true, ...detectInterviewQuestionFromTranscripts(message.transcripts, message.language) };
}

/** Authenticates, requests an answer, stores it, and publishes UI updates. */
async function generateAnswerForQuestion(
  question: string,
  tabId: number | null,
  autoAnswerKey: string,
  language: AssistantLanguage
): Promise<void> {
  try {
    await ensureAuthenticated();
    await publishAssistantStatus(tabId, 'Question detected. Generating answer...');
    if (autoAnswerKey) {
      await markAutoAnswer(question);
    }
    const [model, reasoningEffort, verbosity, fastEnabled, answerType, targetPosition] = await Promise.all([
      getAssistantModel(),
      getAssistantThinkingVariant(),
      getAssistantVerbosity(),
      getAssistantFastEnabled(),
      getAssistantAnswerType(),
      getAssistantTargetPosition()
    ]);
    const answer = await requestInterviewAnswer(
      question,
      tabId,
      model,
      reasoningEffort,
      verbosity,
      fastEnabled,
      language,
      answerType,
      targetPosition
    );
    await appendConversation([{ role: 'assistant', text: answer, createdAt: Date.now() }]);
    await publishAssistantAnswer(tabId, answer, question);
  } catch (error) {
    await publishAssistantStatus(tabId, `Error: ${getErrorMessage(error)}`, 'error');
    throw error;
  } finally {
    if (autoAnswerKey) {
      inFlightAutoAnswerKeys.delete(autoAnswerKey);
    }
  }
}

/** Reserves an automatic answer key and returns an empty string for duplicates. */
function reserveAutoAnswer(question: string): string {
  const key = normalizeAutoAnswerKey(question);
  if (!key || inFlightAutoAnswerKeys.has(key)) {
    return '';
  }

  inFlightAutoAnswerKeys.add(key);
  return key;
}

/** Releases an automatic answer reservation after completion or skip. */
function releaseAutoAnswer(key: string): void {
  inFlightAutoAnswerKeys.delete(key);
}

/** Creates the background-service dedupe key for automatic question handling. */
function normalizeAutoAnswerKey(question: string): string {
  return question.toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim().slice(0, 180);
}

/** Enables and opens Chrome's side panel for the selected tab when available. */
async function openAssistantSidePanel(tabId: number): Promise<void> {
  if (!chrome.sidePanel) {
    return;
  }

  await chrome.sidePanel.setOptions({
    tabId,
    path: EXTENSION_PATHS.sidePanel,
    enabled: true
  }).catch(() => undefined);
  await chrome.sidePanel.open({ tabId }).catch(() => undefined);
}

/** Sends a tab message and falls back to runtime script injection for inactive pages. */
async function sendTabMessageWithInjection<TMessage extends TabMessage>(tabId: number, message: TMessage): Promise<void> {
  const firstAttempt = await sendTabMessage(tabId, message).catch(() => null);
  if (firstAttempt?.ok) {
    return;
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: [EXTENSION_PATHS.contentScript]
  });
  const secondAttempt = await sendTabMessage(tabId, message);
  if (!secondAttempt.ok) {
    throw new Error(secondAttempt.error || 'Could not connect to the active tab.');
  }
}

/** Finds the remembered assistant tab or falls back to the current active tab. */
async function getActiveAssistantTab(): Promise<chrome.tabs.Tab | null> {
  if (activeAssistantTabId != null) {
    const tab = await chrome.tabs.get(activeAssistantTabId).catch(() => null);
    if (tab?.id) {
      return tab;
    }
  }

  const tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0] || null;
  return tab?.id ? tab : null;
}

/** Creates the offscreen audio document required by MV3 tab capture APIs. */
async function ensureOffscreenAudioDocument(): Promise<void> {
  if (await hasOffscreenAudioDocument()) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: EXTENSION_PATHS.offscreenDocument,
    reasons: ['USER_MEDIA', 'AUDIO_PLAYBACK'],
    justification: 'Capture and play the current tab audio for the interview assistant.'
  });
}

/** Checks whether the offscreen audio document already exists. */
async function hasOffscreenAudioDocument(): Promise<boolean> {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [OFFSCREEN_DOCUMENT_URL]
  });
  return contexts.length > 0;
}

/** Normalizes unknown or missing language values to the extension default. */
function normalizeLanguage(language: AssistantLanguage | undefined): AssistantLanguage {
  return normalizeDeepgramLanguage(language);
}
