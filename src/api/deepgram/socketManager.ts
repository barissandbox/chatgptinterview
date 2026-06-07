/** Deepgram WebSocket connection and keep-alive management. */
import { getDeepgramModelForLanguage, normalizeDeepgramLanguage } from '../../shared/languages';
import { APP_URLS, buildUrl } from '../../shared/constants';
import type { AssistantLanguage } from '../../shared/types';

export type DeepgramAuthProtocol = 'token' | 'bearer';

const DEEPGRAM_AUTH_PROTOCOLS: readonly DeepgramAuthProtocol[] = ['token', 'bearer'];
const DEEPGRAM_CONNECT_TIMEOUT_MS = 10_000;
const DEEPGRAM_CONNECT_STABILIZE_MS = 1_200;
const DEEPGRAM_KEEP_ALIVE_MS = 8_000;

/** Builds the Deepgram realtime STT URL for the selected transcript language. */
export function createDeepgramUrl(language: AssistantLanguage): string {
  const normalizedLanguage = normalizeDeepgramLanguage(language);
  return buildUrl(APP_URLS.deepgramListen, {
    model: getDeepgramModelForLanguage(normalizedLanguage),
    encoding: 'linear16',
    sample_rate: '16000',
    channels: '1',
    smart_format: 'true',
    interim_results: 'true',
    vad_events: 'true',
    punctuate: 'true',
    utterance_end_ms: '1000',
    language: normalizedLanguage
  });
}

/** Creates a Deepgram websocket with the requested authorization protocol label. */
export function createDeepgramSocket(
  language: AssistantLanguage,
  apiKey: string,
  protocol: DeepgramAuthProtocol = 'token'
): WebSocket {
  return new WebSocket(createDeepgramUrl(language), [protocol, apiKey]);
}

/** Opens a Deepgram socket, trying supported auth protocol labels in order. */
export async function connectDeepgramSocket(language: AssistantLanguage, apiKey: string): Promise<WebSocket> {
  let lastError: unknown = null;

  for (const protocol of DEEPGRAM_AUTH_PROTOCOLS) {
    const socket = createDeepgramSocket(language, apiKey, protocol);
    try {
      await waitForSocketReady(socket);
      return socket;
    } catch (error) {
      lastError = error;
      closeSocket(socket);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Could not connect to Deepgram.');
}

/** Starts Deepgram keep-alive pings and returns the timer id for cleanup. */
export function startDeepgramKeepAlive(socket: WebSocket): number {
  return window.setInterval(() => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'KeepAlive' }));
    }
  }, DEEPGRAM_KEEP_ALIVE_MS);
}

/** Resolves when Deepgram accepts the socket and rejects clear connection failures. */
function waitForSocketReady(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    let opened = false;
    const timeout = window.setTimeout(() => reject(new Error('Deepgram connection timeout.')), DEEPGRAM_CONNECT_TIMEOUT_MS);

    socket.onopen = () => {
      opened = true;
      window.setTimeout(() => {
        if (socket.readyState === WebSocket.OPEN) {
          window.clearTimeout(timeout);
          resolve();
        }
      }, DEEPGRAM_CONNECT_STABILIZE_MS);
    };
    socket.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error('Could not connect to Deepgram.'));
    };
    socket.onclose = (event) => {
      if (opened) {
        window.clearTimeout(timeout);
        reject(new Error(`Deepgram rejected the connection (${event.code}).`));
      }
    };
  });
}

/** Closes sockets that are still opening/open without surfacing cleanup errors. */
function closeSocket(socket: WebSocket): void {
  if (socket.readyState <= WebSocket.OPEN) {
    socket.close();
  }
}
