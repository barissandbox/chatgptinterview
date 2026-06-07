/** Runtime and tab message validation plus typed transport helpers. */
import { isDeepgramLanguageCode } from './languages';
import type {
  ErrorResult,
  Result,
  RuntimeEventMessage,
  RuntimeRequest,
  StatusPayload,
  TabMessage
} from './types';

export type RuntimeResponse = Result | StatusPayload;
export type TabResponse = Result;

export interface RuntimeResponseByAction {
  'auth.start': Result;
  'auth.signOut': Result;
  'status.get': StatusPayload | ErrorResult;
  'catalog.refreshModels': Result;
  'catalog.refreshLimits': Result;
  'assistant.open': Result;
  'assistant.transcript.append': Result;
  'capture.mic.start': Result;
  'capture.mic.stop': Result;
  'capture.tab.start': Result;
  'capture.tab.stop': Result;
  'assistant.answer.generate': Result;
  'assistant.question.detect': Result<{ isQuestion: boolean; question: string; questions?: string[] }>;
  'assistant.clear': Result;
}

export interface TabResponseByAction {
  'assistant.show': Result;
  'assistant.hide': Result;
  'assistant.answer.render': Result;
  'assistant.status.render': Result;
  'assistant.transcript.render': Result;
  'capture.mic.start': Result;
  'capture.mic.stop': Result;
}

type RuntimeResponseFor<TRequest extends RuntimeRequest> = RuntimeResponseByAction[TRequest['action']];
type TabResponseFor<TMessage extends TabMessage> = TabResponseByAction[TMessage['action']];

/** Validates unknown runtime messages before the background router handles them. */
export function isRuntimeRequest(value: unknown): value is RuntimeRequest {
  const candidate = extractActionRecord(value);
  if (!candidate) {
    return false;
  }

  switch (candidate.action) {
    case 'auth.start':
    case 'auth.signOut':
    case 'status.get':
    case 'catalog.refreshModels':
    case 'catalog.refreshLimits':
    case 'assistant.open':
    case 'assistant.clear':
    case 'assistant.answer.generate':
    case 'capture.mic.start':
    case 'capture.mic.stop':
    case 'capture.tab.start':
    case 'capture.tab.stop':
      return isOptionalLanguage(candidate.language) && isOptionalAnswerSource(candidate.source);
    case 'assistant.question.detect':
      return Array.isArray(candidate.transcripts) && isOptionalLanguage(candidate.language);
    case 'assistant.transcript.append':
      return typeof candidate.text === 'string'
        && (candidate.speaker == null || candidate.speaker === 'candidate' || candidate.speaker === 'interviewer');
    default:
      return false;
  }
}

/** Validates background broadcast events consumed by popup and side panel pages. */
export function isRuntimeEventMessage(value: unknown): value is RuntimeEventMessage {
  return hasAction(value, ['event.authChanged', 'event.assistantUpdated']);
}

/** Validates messages that can be delivered to content scripts or the side panel UI. */
export function isTabMessage(value: unknown): value is TabMessage {
  const candidate = extractActionRecord(value);
  if (!candidate) {
    return false;
  }

  switch (candidate.action) {
    case 'assistant.show':
    case 'assistant.hide':
      return true;
    case 'assistant.answer.render':
      return typeof candidate.answer === 'string'
        && (candidate.streaming == null || typeof candidate.streaming === 'boolean');
    case 'assistant.status.render':
      return typeof candidate.status === 'string';
    case 'assistant.transcript.render':
      return typeof candidate.text === 'string'
        && typeof candidate.isFinal === 'boolean'
        && (candidate.speaker === 'candidate' || candidate.speaker === 'interviewer');
    case 'capture.mic.start':
      return typeof candidate.apiKey === 'string'
        && isOptionalLanguage(candidate.language);
    case 'capture.mic.stop':
      return true;
    default:
      return false;
  }
}

/** Sends a runtime message and narrows the response type from the request action. */
export async function sendRuntimeMessage<TRequest extends RuntimeRequest>(
  message: TRequest
): Promise<RuntimeResponseFor<TRequest>> {
  return chrome.runtime.sendMessage(message) as Promise<RuntimeResponseFor<TRequest>>;
}

/** Sends a tab message and narrows the response type from the tab action. */
export async function sendTabMessage<TMessage extends TabMessage>(
  tabId: number,
  message: TMessage
): Promise<TabResponseFor<TMessage>> {
  return chrome.tabs.sendMessage(tabId, message) as Promise<TabResponseFor<TMessage>>;
}

/** Broadcasts a runtime event without surfacing listener absence as an error. */
export function broadcastRuntimeMessage(message: RuntimeEventMessage): void {
  void chrome.runtime.sendMessage(message).catch(() => undefined);
}

/** Checks whether an unknown value is an action record with a supported action. */
function hasAction(value: unknown, actions: readonly string[]): boolean {
  const candidate = extractActionRecord(value);
  return Boolean(candidate && actions.includes(candidate.action));
}

/** Extracts the shared action-bearing object shape used by all message guards. */
function extractActionRecord(value: unknown): (Record<string, unknown> & { action: string }) | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as { action?: unknown };
  return typeof candidate.action === 'string'
    ? value as Record<string, unknown> & { action: string }
    : null;
}

/** Validates optional language fields while preserving strict message guards. */
function isOptionalLanguage(value: unknown): boolean {
  return value == null || value === 'tr-TR' || isDeepgramLanguageCode(value);
}

/** Validates optional answer-generation source fields for duplicate suppression. */
function isOptionalAnswerSource(value: unknown): boolean {
  return value == null || value === 'auto' || value === 'manual';
}
