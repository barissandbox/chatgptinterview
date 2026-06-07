/** Streams microphone audio to Deepgram and emits transcript updates. */
import { EXTENSION_PATHS, getExtensionUrl } from '../../shared/constants';
import { connectDeepgramSocket, parseDeepgramTranscriptEvent, startDeepgramKeepAlive } from '../../api/deepgram';
import { getDeepgramLanguageLabel } from '../../shared/languages';
import { PcmStream } from '../../shared/audioUtils';
import type { AssistantLanguage } from '../../shared/types';

export interface DeepgramMicCallbacks {
  onTranscript(text: string, isFinal: boolean): void;
  onStatus(status: string, tone?: 'status' | 'error'): void;
}

export class DeepgramMicTranscriber {
  private pcmStream: PcmStream | null = null;
  private socket: WebSocket | null = null;
  private keepAliveTimer: number | null = null;
  private sentAudio = false;
  private active = false;

  /** Stores callbacks used to publish transcript and status updates. */
  constructor(private readonly callbacks: DeepgramMicCallbacks) {}

  /** Opens microphone capture and streams PCM audio to Deepgram. */
  async start(language: AssistantLanguage, apiKey: string): Promise<void> {
    this.stop();
    this.active = true;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });

    try {
      this.socket = await connectDeepgramSocket(language, apiKey);
      this.callbacks.onStatus(`Mic Deepgram connected (${getDeepgramLanguageLabel(language)}).`);
      this.keepAliveTimer = startDeepgramKeepAlive(this.socket);
      this.socket.onmessage = (event) => {
        const transcript = parseDeepgramTranscriptEvent(event.data);
        if (transcript) {
          this.callbacks.onTranscript(transcript.text, transcript.isFinal);
        }
      };
      this.socket.onerror = () => this.callbacks.onStatus('Mic STT connection error.', 'error');
      this.socket.onclose = (event) => {
        if (this.active) {
          this.callbacks.onStatus(`Mic STT disconnected (${event.code}).`, 'error');
        }
      };

      this.pcmStream = await PcmStream.start({
        stream,
        workletUrl: getExtensionUrl(EXTENSION_PATHS.audioWorklet),
        onAudioChunk: (chunk) => {
          if (!this.active || this.socket?.readyState !== WebSocket.OPEN) {
            return;
          }
          if (!this.sentAudio) {
            this.sentAudio = true;
            this.callbacks.onStatus('Mic audio streaming to Deepgram.');
          }
          this.socket.send(chunk);
        }
      });
    } catch (error) {
      stream.getTracks().forEach((track) => track.stop());
      this.stop();
      throw error;
    }
  }

  /** Releases microphone, audio graph, timers, and websocket resources. */
  stop(): void {
    this.active = false;
    this.pcmStream?.stop();
    if (this.keepAliveTimer != null) {
      window.clearInterval(this.keepAliveTimer);
    }
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) {
      this.socket.close(1000, 'Stopped');
    }

    this.pcmStream = null;
    this.socket = null;
    this.keepAliveTimer = null;
    this.sentAudio = false;
  }
}
