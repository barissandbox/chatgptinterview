/** ChatGPT responses client plus streaming/SSE parsing helpers. */
import { DEFAULT_MODEL, INTERVIEW_SYSTEM_PROMPT } from '../../shared/settings';
import { APP_URLS } from '../../shared/constants';
import { broadcastRuntimeMessage } from '../../shared/messaging';
import { getStorage } from '../../shared/storage';
import { asRecord } from '../../shared/records';
import type { AccessContext, ResponseStyle, ThinkingVariant } from '../../shared/types';
import { getValidAccessContext } from './authClient';
import { createChatGptRequestHeaders } from './headersFactory';
import { refreshStoredLimitInfo } from './usageTracker';

const LIMIT_REFRESH_MAX_AGE_MS = 5 * 60 * 1000;

interface AccessTokenClaimsResponse {
  response?: {
    output?: unknown[];
  };
  output?: unknown[];
}

interface ResponseAccumulator {
  text: string;
  completedText: string;
  rawText: string;
  sawSse: boolean;
}

interface ParsedSsePayload {
  delta: string;
  completedText: string;
}

export interface ChatGptRequest {
  prompt: string;
  imageDataUrl?: string | null;
  model?: string;
  reasoningEffort?: ThinkingVariant;
  instructions?: string;
  responseStyle?: ResponseStyle;
  fastEnabled?: boolean;
  onTextUpdate?: (text: string) => void;
}

/** Calls ChatGPT responses with streaming enabled and returns the final text. */
export async function callChatGpt({
  prompt,
  imageDataUrl,
  model = DEFAULT_MODEL,
  reasoningEffort = 'medium',
  instructions = INTERVIEW_SYSTEM_PROMPT,
  responseStyle = 'low',
  fastEnabled = true,
  onTextUpdate
}: ChatGptRequest): Promise<string> {
  const accessContext = await getValidAccessContext();
  const content: Array<Record<string, string>> = [{ type: 'input_text', text: prompt }];
  if (imageDataUrl) {
    content.push({ type: 'input_image', image_url: imageDataUrl });
  }

  const body: Record<string, unknown> = {
    model,
    input: [{ type: 'message', role: 'user', content }],
    stream: true,
    store: false,
    include: ['reasoning.encrypted_content'],
    text: { verbosity: responseStyle },
    reasoning: { effort: reasoningEffort, summary: 'auto' },
    instructions: instructions || '.'
  };
  if (fastEnabled) {
    body.service_tier = 'priority';
  }

  const response = await fetch(APP_URLS.chatgptResponses, {
    method: 'POST',
    headers: createChatGptRequestHeaders(accessContext, 'text/event-stream'),
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`ChatGPT request failed with status ${response.status}.${body ? ` ${body.slice(0, 240)}` : ''}`);
  }

  if (response.body) {
    return finalizeChatGptResponse(readResponseStream(response, onTextUpdate), accessContext);
  }

  const bodyText = await response.text();
  if (bodyText.trimStart().startsWith('event:') || bodyText.trimStart().startsWith('data:')) {
    return finalizeChatGptResponse(parseSseText(bodyText), accessContext);
  }

  return finalizeChatGptResponse(extractCompletedText(JSON.parse(bodyText) as AccessTokenClaimsResponse), accessContext);
}

/** Reads a streaming response body and emits incremental text updates. */
export async function readResponseStream(response: Response, onTextUpdate?: (text: string) => void): Promise<string> {
  if (!response.body) {
    return extractCompletedText(await response.json() as AccessTokenClaimsResponse);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const accumulator = createResponseAccumulator();

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    const chunk = decoder.decode(value, { stream: true });
    accumulator.rawText += chunk;
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';

    for (const line of lines) {
      const previousText = accumulator.text;
      appendSseLine(accumulator, line);
      if (onTextUpdate && accumulator.text && accumulator.text !== previousText) {
        onTextUpdate(accumulator.text.trim());
      }
    }
  }

  const trailingText = decoder.decode();
  if (trailingText) {
    accumulator.rawText += trailingText;
    buffer += trailingText;
  }

  if (buffer) {
    appendSseLine(accumulator, buffer);
  }

  return finalizeResponseAccumulator(accumulator);
}

/** Parses a complete SSE response body into final assistant text. */
export function parseSseText(bodyText: string): string {
  const accumulator = createResponseAccumulator();

  for (const line of bodyText.split(/\r?\n/)) {
    appendSseLine(accumulator, line);
  }

  return finalizeResponseAccumulator(accumulator);
}

/** Appends one SSE data line into the accumulated response state. */
export function appendSseLine(accumulator: ResponseAccumulator, line: string): void {
  if (!line.startsWith('data:')) {
    return;
  }

  accumulator.sawSse = true;
  const payload = line.slice(5).trim();
  if (!payload || payload === '[DONE]') {
    return;
  }

  const parsed = parseSsePayload(payload);
  accumulator.text += parsed.delta;
  accumulator.completedText = parsed.completedText || accumulator.completedText;
}

/** Extracts completed text from a non-streaming or completed response payload. */
export function extractCompletedText(root: unknown): string {
  const response = asRecord(root).response ? asRecord(asRecord(root).response) : asRecord(root);
  const output = Array.isArray(response.output) ? response.output : [];
  const parts: string[] = [];

  for (const item of output) {
    const message = asRecord(item);
    if (message.type !== 'message' || !Array.isArray(message.content)) {
      continue;
    }

    for (const part of message.content) {
      const content = asRecord(part);
      if (content.type === 'output_text' && typeof content.text === 'string') {
        parts.push(content.text);
      }
    }
  }

  return parts.join('').trim();
}

/** Creates an empty response accumulator for stream parsing. */
export function createResponseAccumulator(): ResponseAccumulator {
  return {
    text: '',
    completedText: '',
    rawText: '',
    sawSse: false
  };
}

/** Returns the best final text from a completed accumulator. */
function finalizeResponseAccumulator(accumulator: ResponseAccumulator): string {
  if (accumulator.text || accumulator.completedText) {
    return (accumulator.text || accumulator.completedText).trim();
  }

  const rawText = accumulator.rawText.trim();
  if (!rawText) {
    return 'No response text was returned.';
  }

  if (!accumulator.sawSse) {
    try {
      return extractCompletedText(JSON.parse(rawText) as AccessTokenClaimsResponse) || rawText;
    } catch {
      return rawText;
    }
  }

  return 'No response text was returned.';
}

/** Parses one JSON SSE payload and extracts delta or completed response text. */
function parseSsePayload(payload: string): ParsedSsePayload {
  try {
    const event = asRecord(JSON.parse(payload));
    const delta = extractSseDeltaText(event);
    if (delta) {
      return { delta, completedText: '' };
    }

    if (event.type === 'response.completed') {
      return { delta: '', completedText: extractCompletedText(event.response || event) };
    }
  } catch (error) {
    console.warn('Unable to parse ChatGPT stream event.', error);
  }

  return { delta: '', completedText: '' };
}

/** Extracts text from known streaming delta event shapes. */
function extractSseDeltaText(event: Record<string, unknown>): string {
  const eventType = typeof event.type === 'string' ? event.type : '';
  if (!isOutputTextDeltaEvent(eventType)) {
    return '';
  }

  if (typeof event.delta === 'string') {
    return event.delta;
  }

  const delta = asRecord(event.delta);
  if (typeof delta.text === 'string') {
    return delta.text;
  }

  if (typeof event.text === 'string') {
    return event.text;
  }

  return '';
}

/** Allows only assistant-visible output text events and rejects reasoning deltas. */
function isOutputTextDeltaEvent(eventType: string): boolean {
  return eventType === 'response.output_text.delta'
    || eventType === 'response.output_text.annotation.added'
    || (
      eventType.endsWith('.delta')
      && /(^|[._])output([._]|$)/.test(eventType)
      && /(^|[._])text([._]|$)/.test(eventType)
      && !/(^|[._])reasoning([._]|$)/.test(eventType)
    );
}

/** Awaits final text and refreshes usage metadata after a ChatGPT request. */
async function finalizeChatGptResponse(textOrPromise: Promise<string> | string, accessContext: AccessContext): Promise<string> {
  const text = await Promise.resolve(textOrPromise);
  await maybeRefreshLimitInfo(accessContext);
  return text;
}

/** Refreshes usage limits when the cached value is stale. */
async function maybeRefreshLimitInfo(accessContext: AccessContext): Promise<void> {
  const { catalog } = await getStorage('catalog');
  const lastUpdatedAt = typeof catalog?.limitInfoUpdatedAt === 'number' && Number.isFinite(catalog.limitInfoUpdatedAt)
    ? catalog.limitInfoUpdatedAt
    : 0;
  const shouldRefresh = Date.now() - lastUpdatedAt >= LIMIT_REFRESH_MAX_AGE_MS;

  if (shouldRefresh) {
    await refreshStoredLimitInfo(accessContext);
    broadcastRuntimeMessage({ action: 'event.assistantUpdated' });
  }
}
