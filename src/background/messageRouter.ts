/** Dispatches validated runtime messages to their respective service modules. */
import { isRuntimeRequest, sendTabMessage } from '../shared/messaging';
import { toErrorResult } from '../shared/errors';
import { startLogin, signOut } from '../features/auth';
import {
  openAssistant,
  appendTranscript,
  startMicCapture,
  stopMicCapture,
  startTabAudioCapture,
  stopTabAudioCapture,
  generateAssistantAnswer,
  clearConversation,
  detectInterviewQuestion
} from '../features/assistant';
import { getStatus, refreshLimits, refreshModels } from '../features/status';
import type { RuntimeRequest, Result, StatusPayload, TabMessage } from '../shared/types';

type RuntimeResponse = Result | StatusPayload;

interface OffscreenTabRelayMessage {
  target: 'background-tab-relay';
  tabId: number;
  message: TabMessage;
}

/** Background runtime message handler that validates and routes extension requests. */
export function routeRuntimeMessage(
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: RuntimeResponse) => void
): boolean {
  if (isOffscreenTabRelayMessage(message)) {
    resolveAndRespond(relayTabMessage(message.tabId, message.message), sendResponse);
    return true;
  }

  if (!isRuntimeRequest(message)) {
    return false;
  }

  resolveAndRespond(dispatch(message, sender), sendResponse);
  return true;
}

/** Dispatches a validated request to the matching service handler. */
async function dispatch(message: RuntimeRequest, sender: chrome.runtime.MessageSender): Promise<RuntimeResponse> {
  switch (message.action) {
    case 'auth.start':
      return startLogin();
    case 'auth.signOut':
      return signOut();
    case 'status.get':
      return getStatus();
    case 'catalog.refreshModels':
      return refreshModels();
    case 'catalog.refreshLimits':
      return refreshLimits();
    case 'assistant.open':
      return openAssistant(sender.tab);
    case 'assistant.transcript.append':
      return appendTranscript(message);
    case 'capture.mic.start':
      return startMicCapture(message, sender);
    case 'capture.mic.stop':
      return stopMicCapture(sender);
    case 'capture.tab.start':
      return startTabAudioCapture(message, sender);
    case 'capture.tab.stop':
      return stopTabAudioCapture();
    case 'assistant.answer.generate':
      return generateAssistantAnswer(message, sender);
    case 'assistant.question.detect':
      return detectInterviewQuestion(message);
    case 'assistant.clear':
      return clearConversation();
  }
}

/** Relays offscreen audio UI updates to side panel and the active content script. */
async function relayTabMessage(tabId: number, message: TabMessage): Promise<RuntimeResponse> {
  broadcastSidePanelMessage(message);
  await sendTabMessage(tabId, message).catch(() => undefined);
  return { ok: true };
}

/** Validates tab relay messages sent from the offscreen document. */
function isOffscreenTabRelayMessage(value: unknown): value is OffscreenTabRelayMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<OffscreenTabRelayMessage>;
  return candidate.target === 'background-tab-relay'
    && typeof candidate.tabId === 'number'
    && isRelayTabMessage(candidate.message);
}

/** Restricts offscreen relay payloads to status and transcript updates. */
function isRelayTabMessage(value: unknown): value is TabMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<TabMessage>;
  return candidate.action === 'assistant.status.render'
    || candidate.action === 'assistant.transcript.render';
}

/** Mirrors tab UI messages into the side panel runtime channel. */
function broadcastSidePanelMessage(message: TabMessage): void {
  void chrome.runtime.sendMessage(message).catch(() => undefined);
}

/** Resolves a service promise and sends the result or a normalized error. */
function resolveAndRespond(
  promise: Promise<RuntimeResponse>,
  sendResponse: (response?: RuntimeResponse) => void
): void {
  promise
    .then((result) => sendResponse(result))
    .catch((error: unknown) => {
      console.error('[router]', error);
      sendResponse(toErrorResult(error));
    });
}
