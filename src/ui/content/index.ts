/** Content-script entrypoint for assistant UI and local microphone capture. */
import { isTabMessage } from '../../shared/messaging';
import { getErrorMessage } from '../../shared/errors';
import { normalizeDeepgramLanguage } from '../../shared/languages';
import { DeepgramMicTranscriber } from './micTranscriber';
import {
  hideAssistantOverlay,
  renderAssistantAnswer,
  renderAssistantStatus,
  renderTranscript,
  showAssistantOverlay
} from './overlayController';
import type {
  AssistantLanguage,
  Result,
  TabMessage
} from '../../shared/types';

type TabHandlerPayload = Record<never, never>;
type TabMessageResponse = Result;

chrome.runtime.onMessage.addListener(handleTabRuntimeMessage);

let pageMicTranscriber: DeepgramMicTranscriber | null = null;

/** Dispatches supported tab messages and always answers with a typed result payload. */
function handleTabRuntimeMessage(
  incoming: unknown,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response: TabMessageResponse) => void
): boolean {
  if (!isTabMessage(incoming)) {
    return false;
  }

  Promise.resolve(handleMessage(incoming))
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error: unknown) => sendResponse({ ok: false, error: getErrorMessage(error) }));
  return true;
}

/** Routes supported tab actions to page UI updates or local audio capture helpers. */
function handleMessage(message: TabMessage): Promise<TabHandlerPayload> | TabHandlerPayload {
  switch (message.action) {
    case 'assistant.show':
      showAssistantOverlay(message);
      return {};
    case 'assistant.hide':
      hideAssistantOverlay();
      return {};
    case 'assistant.answer.render':
      renderAssistantAnswer(message.answer, message.question, message.streaming === true);
      return {};
    case 'assistant.status.render':
      renderAssistantStatus(message.status, message.tone);
      return {};
    case 'assistant.transcript.render':
      renderTranscript(message.text, message.speaker, message.isFinal, {
        persist: false,
        detect: false
      });
      return {};
    case 'capture.mic.start':
      return startPageMicCapture(
        message.apiKey,
        normalizeDeepgramLanguage(message.language)
      );
    case 'capture.mic.stop':
      stopPageMicCapture();
      return {};
    default:
      throw new Error('Unsupported tab action.');
  }
}

/** Starts microphone transcription and relays candidate transcript updates to runtime UIs. */
async function startPageMicCapture(apiKey: string, language: AssistantLanguage): Promise<TabHandlerPayload> {
  stopPageMicCapture();
  pageMicTranscriber = new DeepgramMicTranscriber({
    onTranscript: (text, isFinal) => {
      broadcastRuntimeTabMessage({
        action: 'assistant.transcript.render',
        text,
        speaker: 'candidate',
        isFinal
      });
    },
    onStatus: (status, tone = 'status') => {
      broadcastRuntimeTabMessage({
        action: 'assistant.status.render',
        status,
        tone
      });
    }
  });
  await pageMicTranscriber.start(language, apiKey);
  broadcastRuntimeTabMessage({
    action: 'assistant.status.render',
    status: 'Microphone Speech to Text started.'
  });
  return {};
}

/** Stops the active page microphone transcriber when present. */
function stopPageMicCapture(): void {
  pageMicTranscriber?.stop();
  pageMicTranscriber = null;
}

/** Broadcasts tab-originated UI updates through the background runtime channel. */
function broadcastRuntimeTabMessage(message: TabMessage): void {
  if (!isRuntimeContextAvailable()) {
    stopPageMicCapture();
    return;
  }

  try {
    void chrome.runtime.sendMessage(message).catch(() => undefined);
  } catch {
    stopPageMicCapture();
  }
}

/** Returns false after the extension is reloaded and this content script is invalidated. */
function isRuntimeContextAvailable(): boolean {
  try {
    return Boolean(chrome.runtime?.id);
  } catch {
    return false;
  }
}
