/** Captures current-tab audio in an extension offscreen document. */
import { EXTENSION_PATHS, getExtensionUrl } from '../../shared/constants';
import { connectDeepgramSocket, parseDeepgramTranscriptEvent, startDeepgramKeepAlive } from '../../api/deepgram';
import { getDeepgramLanguageLabel, normalizeDeepgramLanguage } from '../../shared/languages';
import { PcmStream } from '../../shared/audioUtils';
import type { AssistantLanguage } from '../../shared/types';

interface StartAudioMessage {
  target: 'offscreen-audio';
  type: 'start-audio';
  streamId: string;
  tabId: number;
  apiKey: string;
  language?: AssistantLanguage;
}

interface StopAudioMessage {
  target: 'offscreen-audio';
  type: 'stop-audio';
}

type OffscreenAudioMessage = StartAudioMessage | StopAudioMessage;
type RelayStatusMessage = {
  action: 'assistant.status.render';
  status: string;
  tone: 'status' | 'error';
};
type RelayTranscriptMessage = {
  action: 'assistant.transcript.render';
  text: string;
  speaker: 'interviewer';
  isFinal: boolean;
};
type TabRelayMessage = RelayTranscriptMessage | RelayStatusMessage;

let tabAudioStream: PcmStream | null = null;
let deepgramSocket: WebSocket | null = null;
let targetTabId: number | null = null;
let keepAliveTimer: number | null = null;
let sentAudio = false;

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!isOffscreenAudioMessage(message)) {
    return false;
  }

  if (message.type === 'stop-audio') {
    stopTabAudio();
    sendResponse({ ok: true });
    return false;
  }

  startTabAudio(message.streamId, message.tabId, message.apiKey, normalizeDeepgramLanguage(message.language))
    .then(() => sendResponse({ ok: true }))
    .catch((error: unknown) => sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : 'Could not start tab audio.'
    }));
  return true;
});

/** Starts tab-audio capture, Deepgram streaming, and transcript relay to the page. */
async function startTabAudio(streamId: string, tabId: number, apiKey: string, language: AssistantLanguage): Promise<void> {
  stopTabAudio();
  targetTabId = tabId;

  try {
    deepgramSocket = await connectDeepgramSocket(language, apiKey);
    sendStatus(`Speaker Deepgram connected (${getDeepgramLanguageLabel(language)}).`);
    keepAliveTimer = startDeepgramKeepAlive(deepgramSocket);
    deepgramSocket.onmessage = (event) => {
      const transcript = parseDeepgramTranscriptEvent(event.data);
      if (transcript && targetTabId != null) {
        void sendTabRelayMessage(targetTabId, {
          action: 'assistant.transcript.render',
          text: transcript.text,
          speaker: 'interviewer',
          isFinal: transcript.isFinal
        });
      }
    };
    deepgramSocket.onerror = () => sendStatus('Speaker STT connection error.', 'error');
    deepgramSocket.onclose = (event) => {
      if (targetTabId != null) {
        sendStatus(`Speaker STT disconnected (${event.code}).`, 'error');
      }
    };

    const stream = await navigator.mediaDevices.getUserMedia(createTabAudioConstraints(streamId));
    if (stream.getAudioTracks().length === 0) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error('Current tab audio is not available.');
    }

    tabAudioStream = await PcmStream.start({
      stream,
      workletUrl: getExtensionUrl(EXTENSION_PATHS.audioWorklet),
      passthroughAudio: true,
      onTrackEnded: stopTabAudio,
      onAudioChunk: (chunk) => {
        if (deepgramSocket?.readyState === WebSocket.OPEN) {
          if (!sentAudio) {
            sentAudio = true;
            sendStatus('Speaker audio streaming to Deepgram.');
          }
          deepgramSocket.send(chunk);
        }
      }
    });
  } catch (error) {
    stopTabAudio();
    throw error;
  }
}

/** Tears down tab-audio capture resources in MV3 offscreen-document scope. */
function stopTabAudio(): void {
  tabAudioStream?.stop();
  if (keepAliveTimer != null) {
    window.clearInterval(keepAliveTimer);
  }

  tabAudioStream = null;
  targetTabId = null;
  keepAliveTimer = null;
  sentAudio = false;
  if (deepgramSocket && deepgramSocket.readyState <= WebSocket.OPEN) {
    deepgramSocket.close(1000, 'Stopped');
  }
  deepgramSocket = null;
}

/** Builds Chrome-specific tab capture constraints from a media stream id. */
function createTabAudioConstraints(streamId: string): MediaStreamConstraints {
  return {
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId
      }
    },
    video: false
  } as unknown as MediaStreamConstraints;
}

/** Validates messages intended for the offscreen audio document. */
function isOffscreenAudioMessage(value: unknown): value is OffscreenAudioMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<OffscreenAudioMessage>;
  return candidate.target === 'offscreen-audio'
    && (
      candidate.type === 'stop-audio'
      || (
        candidate.type === 'start-audio'
        && typeof candidate.streamId === 'string'
        && typeof candidate.tabId === 'number'
        && typeof candidate.apiKey === 'string'
      )
    );
}

/** Sends status updates through the background relay to avoid direct tab access here. */
function sendStatus(status: string, tone: 'status' | 'error' = 'status'): void {
  if (targetTabId == null) {
    return;
  }
  void sendTabRelayMessage(targetTabId, {
    action: 'assistant.status.render',
    status,
    tone
  });
}

/** Relays a tab-bound UI message through the background service worker. */
function sendTabRelayMessage(tabId: number, message: TabRelayMessage): Promise<unknown> {
  return chrome.runtime.sendMessage({
    target: 'background-tab-relay',
    tabId,
    message
  }).catch(() => undefined);
}
