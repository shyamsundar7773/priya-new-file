import { AudioModule } from 'expo-audio';
import { supabase } from '../auth/supabase';
import { aiBackendUrl } from '../ai/config';
import { PcmAudioOutput } from './liveAudio';
import type { AudioStreamBuffer } from 'expo-audio';
import { buildLiveSystemInstruction, type LiveVoiceContext } from './liveContext';
import { createReconnectBudget } from './callState';
import { SpeechActivityDetector } from './speechActivity';

export type LiveSessionState = 'idle' | 'connecting' | 'providerConnecting' | 'setupPending' | 'connected' | 'userSpeaking' | 'thinking' | 'modelSpeaking' | 'interrupted' | 'reconnecting' | 'ending' | 'failed' | 'ended';

export interface LiveSessionEvents {
  onStateChange?: (state: LiveSessionState, error?: string) => void;
  onInputTranscript?: (text: string) => void;
  onOutputTranscript?: (text: string) => void;
}

function websocketEndpoint(url: string, token: string): string {
  const parsed = new URL(url);
  parsed.protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
  const pathname = parsed.pathname.replace(/\/+(chat|tts)\/?$/, '').replace(/\/+$/, '');
  parsed.pathname = `${pathname}/live`;
  parsed.searchParams.set('access_token', token);
  return parsed.toString();
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LIVE_DIAGNOSTICS = typeof __DEV__ !== 'undefined' && __DEV__;
const CONNECTION_TIMEOUT_MS = 10_000;
const SETUP_TIMEOUT_MS = 15_000;

function toBase64(bytes: Uint8Array): string {
  let result = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index];
    const b = bytes[index + 1] ?? 0;
    const c = bytes[index + 2] ?? 0;
    result += BASE64[a >> 2];
    result += BASE64[((a & 3) << 4) | (b >> 4)];
    result += index + 1 < bytes.length ? BASE64[((b & 15) << 2) | (c >> 6)] : '=';
    result += index + 2 < bytes.length ? BASE64[c & 63] : '=';
  }
  return result;
}

function resampleTo16k(buffer: AudioStreamBuffer): Uint8Array {
  const input = new Int16Array(buffer.data);
  if (buffer.sampleRate === 16000 && buffer.channels === 1) return new Uint8Array(input.buffer);
  const frames = Math.floor(input.length / buffer.channels);
  const outputLength = Math.max(1, Math.floor(frames * 16000 / buffer.sampleRate));
  const output = new Int16Array(outputLength);
  for (let index = 0; index < outputLength; index += 1) {
    const sourceFrame = Math.min(frames - 1, Math.floor(index * buffer.sampleRate / 16000));
    let total = 0;
    for (let channel = 0; channel < buffer.channels; channel += 1) total += input[sourceFrame * buffer.channels + channel];
    output[index] = Math.round(total / buffer.channels);
  }
  return new Uint8Array(output.buffer);
}

export { buildLiveSystemInstruction };
export type { LiveVoiceContext };

export class GeminiLiveSession {
  private socket?: WebSocket;
  private readonly output: PcmAudioOutput;
  private state: LiveSessionState = 'idle';
  private stopping = false;
  private everConnected = false;
  private context?: LiveVoiceContext;
  private token?: string;
  private generation = 0;
  private connectionTimer?: ReturnType<typeof setTimeout>;
  private inputFrames = 0;
  private inputBytes = 0;
  private responseMessages = 0;
  private responseAudioChunks = 0;
  private setupAcknowledged = false;
  private setupTimer?: ReturnType<typeof setTimeout>;
  private startReject?: (error: Error) => void;
  private startResolve?: () => void;
  private reconnectAllowed = createReconnectBudget(1);
  private speechDetector = new SpeechActivityDetector();
  private speechActive = false;
  private responseActive = false;
  private discardOutputUntilInputTurn = false;
  private firstInputAt?: number;
  private firstOutputAt?: number;
  private firstPlaybackAt?: number;
  private requestId = 'unknown';

  constructor(private readonly events: LiveSessionEvents = {}) {
    this.output = new PcmAudioOutput((playing) => {
      if (this.stopping || this.state === 'failed' || this.state === 'ended') return;
      if (playing) {
        this.setState('modelSpeaking');
        if (!this.firstPlaybackAt) {
          this.firstPlaybackAt = Date.now();
          if (LIVE_DIAGNOSTICS) console.log(`[live-client] requestId=${this.requestId} first_speaker_playback elapsedFromOutputMs=${this.firstOutputAt ? this.firstPlaybackAt - this.firstOutputAt : 'unknown'}`);
        }
      }
      else if (!this.responseActive && !this.speechActive && this.state !== 'reconnecting') this.setState('connected');
    });
  }

  getDiagnostics(): { sessionState: LiveSessionState; websocketState: 'none' | 'connecting' | 'open' | 'closing' | 'closed'; outputBusy: boolean } {
    const readyState = this.socket?.readyState;
    const websocketState = readyState === WebSocket.CONNECTING
      ? 'connecting'
      : readyState === WebSocket.OPEN
        ? 'open'
        : readyState === WebSocket.CLOSING
          ? 'closing'
          : readyState === WebSocket.CLOSED
            ? 'closed'
            : 'none';
    return { sessionState: this.state, websocketState, outputBusy: this.output.isBusy };
  }

  async start(context: LiveVoiceContext): Promise<void> {
    if (!aiBackendUrl) throw new Error('AI backend URL is not configured.');
    const permission = await AudioModule.requestRecordingPermissionsAsync();
    if (!permission.granted) throw new Error('Microphone permission was denied.');
    const session = await supabase?.auth.getSession();
    const token = session?.data.session?.access_token;
    if (!token) throw new Error('A signed-in session is required for Gemini Live.');
    this.stopping = false;
    this.everConnected = false;
    this.context = context;
    this.token = token;
    this.currentUserId = session?.data.session?.user.id;
    this.requestId = context.requestId || `call-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.reconnectAllowed = createReconnectBudget(1);
    this.speechDetector.reset();
    this.speechActive = false;
    this.responseActive = false;
    this.discardOutputUntilInputTurn = false;
    this.firstInputAt = undefined;
    this.firstOutputAt = undefined;
    this.firstPlaybackAt = undefined;
    this.inputFrames = 0;
    this.inputBytes = 0;
    this.responseMessages = 0;
    this.responseAudioChunks = 0;
    this.setupAcknowledged = false;
    this.clearSetupTimer();
    if (LIVE_DIAGNOSTICS) console.log(`[live-client] requestId=${this.requestId} start contextChars=${buildLiveSystemInstruction(context).length}`);
    await this.connect(false);
  }

  sendAudio(buffer: AudioStreamBuffer): void {
    if (!['connected', 'userSpeaking', 'thinking', 'modelSpeaking', 'interrupted'].includes(this.state) || this.socket?.readyState !== WebSocket.OPEN) return;
    const activity = this.speechDetector.update(buffer.data);
    if (activity === 'started') {
      this.speechActive = true;
      if (this.state === 'modelSpeaking' || this.output.isBusy) {
        this.setState('interrupted');
        this.interrupt();
      }
      this.setState('userSpeaking');
    } else if (activity === 'ended') {
      this.speechActive = false;
      this.setState('thinking');
    }
    const audio = resampleTo16k(buffer);
    this.inputFrames += 1;
    this.inputBytes += audio.byteLength;
    if (!this.firstInputAt) {
      this.firstInputAt = Date.now();
      if (LIVE_DIAGNOSTICS) console.log(`[live-client] requestId=${this.requestId} first_mic_capture timestamp=${this.firstInputAt}`);
    }
    if (LIVE_DIAGNOSTICS && (this.inputFrames === 1 || this.inputFrames % 50 === 0)) {
      console.log(`[live-client] requestId=${this.requestId} pcm frames=${this.inputFrames} bytes=${this.inputBytes}`);
    }
    this.socket.send(JSON.stringify({ type: 'audio', data: toBase64(audio), mimeType: 'audio/pcm;rate=16000' }));
    if (this.inputFrames === 1 && LIVE_DIAGNOSTICS) {
      console.log(`[live-client] requestId=${this.requestId} first_websocket_send elapsedFromMicMs=${this.firstInputAt ? Date.now() - this.firstInputAt : 'unknown'}`);
    }
  }

  interrupt(): void {
    this.discardOutputUntilInputTurn = true;
    this.responseActive = false;
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: 'interrupt' }));
    this.output.clear();
  }

  async stop(): Promise<void> {
    if (this.stopping) return;
    this.stopping = true;
    this.startReject?.(new Error('Call ended.'));
    this.generation += 1;
    this.clearConnectionTimer();
    this.clearSetupTimer();
    this.startReject = undefined;
    this.startResolve = undefined;
    this.setState('ending');
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: 'stop' }));
    this.socket?.close();
    this.socket = undefined;
    this.output.stop();
    this.setState('ended');
  }

  private connect(reconnecting: boolean): Promise<void> {
    const backendUrl = aiBackendUrl;
    const token = this.token;
    const context = this.context;
    if (!backendUrl || !token || !context) return Promise.reject(new Error('Call connection context is unavailable.'));
    const generation = ++this.generation;
    this.setupAcknowledged = false;
    if (reconnecting) {
      this.setState('reconnecting');
      this.output.clear();
      this.responseActive = false;
      this.speechDetector.reset();
      this.speechActive = false;
      this.discardOutputUntilInputTurn = false;
    } else {
      this.setState('connecting');
    }
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      this.startResolve = () => {
        if (settled || generation !== this.generation) return;
        settled = true;
        this.clearConnectionTimer();
        this.clearSetupTimer();
        this.startResolve = undefined;
        this.startReject = undefined;
        resolve();
      };
      this.startReject = (error) => {
        if (settled || generation !== this.generation) return;
        settled = true;
        this.clearConnectionTimer();
        this.clearSetupTimer();
        this.startResolve = undefined;
        this.startReject = undefined;
        reject(error);
      };
      this.connectionTimer = setTimeout(() => this.fail('Gemini Live connection timed out.', generation), CONNECTION_TIMEOUT_MS);
      const socket = new WebSocket(websocketEndpoint(backendUrl, token));
      this.socket = socket;
      socket.onopen = () => {
        if (generation !== this.generation || this.stopping) return;
        this.clearConnectionTimer();
        this.setState('setupPending');
        try {
          socket.send(JSON.stringify({
            type: 'start',
            context: {
              ...context,
              requestId: this.requestId,
              userId: this.currentUserId,
              systemInstruction: buildLiveSystemInstruction(context),
            },
          }));
        } catch {
          this.fail('Gemini Live connection failed.', generation);
          return;
        }
        this.setupTimer = setTimeout(() => this.fail('Gemini Live setup timed out.', generation), SETUP_TIMEOUT_MS);
        if (LIVE_DIAGNOSTICS) console.log(`[live-client] requestId=${this.requestId} websocket_open setup_sent reconnecting=${reconnecting}`);
      };
      socket.onerror = () => {
        if (generation !== this.generation || this.stopping) return;
        if (this.everConnected) this.handleDisconnect('Gemini Live connection was interrupted.', generation);
        else this.fail('Gemini Live connection failed.', generation);
      };
      socket.onclose = (event) => {
        if (generation !== this.generation) return;
        this.socket = undefined;
        if (LIVE_DIAGNOSTICS) console.log(`[live-client] requestId=${this.requestId} websocket_closed inputFrames=${this.inputFrames} inputBytes=${this.inputBytes} responseMessages=${this.responseMessages} responseAudioChunks=${this.responseAudioChunks} code=${event.code}`);
        if (!this.stopping) this.handleDisconnect('Gemini Live connection was interrupted.', generation);
      };
      socket.onmessage = (event) => this.handleMessage(event.data, generation);
    });
  }

  private currentUserId?: string;

  private async handleDisconnect(message: string, generation: number): Promise<void> {
    if (this.stopping || generation !== this.generation || this.state === 'failed' || this.state === 'ended') return;
    this.clearConnectionTimer();
    this.clearSetupTimer();
    const socket = this.socket;
    this.socket = undefined;
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) socket.close();
    if (!this.everConnected || !this.reconnectAllowed()) {
      this.fail(message, generation);
      return;
    }
    this.setState('reconnecting');
    if (LIVE_DIAGNOSTICS) console.log(`[live-client] requestId=${this.requestId} reconnect_attempt=1`);
    try {
      await this.connect(true);
    } catch {
      this.fail('Gemini Live connection was interrupted.', this.generation);
    }
  }

  private handleMessage(raw: unknown, generation: number): void {
    if (this.stopping || generation !== this.generation || this.state === 'failed' || this.state === 'ended') return;
    let message: { type?: string; state?: LiveSessionState; error?: string; payload?: Record<string, unknown> };
    try {
      message = JSON.parse(String(raw)) as typeof message;
    } catch {
      this.fail('Gemini Live returned malformed session data.', generation);
      return;
    }
    if (message.type === 'state' && message.state) {
      if (message.state === 'connected' && !this.setupAcknowledged) return;
      if (message.state === 'failed') {
        this.fail(message.error || 'Gemini Live connection failed.', generation);
        return;
      }
      if (message.state === 'ended') {
        if (this.everConnected) void this.handleDisconnect('Gemini Live connection was interrupted.', generation);
        else this.fail('Gemini Live setup did not complete.', generation);
        return;
      }
      if (LIVE_DIAGNOSTICS) console.log(`[live-client] requestId=${this.requestId} state=${message.state}`);
      this.setState(message.state, message.error);
      return;
    }
    if (message.type !== 'server' || !message.payload) return;
    this.responseMessages += 1;
    if (message.payload.setupComplete) {
      this.setupAcknowledged = true;
      this.everConnected = true;
      this.clearSetupTimer();
      this.setState('connected');
      if (LIVE_DIAGNOSTICS) console.log(`[live-client] requestId=${this.requestId} Gemini setup acknowledged`);
      this.startResolve?.();
    }
    const content = message.payload.serverContent as Record<string, unknown> | undefined;
    const input = content?.inputTranscription as { text?: string } | undefined;
    const output = content?.outputTranscription as { text?: string } | undefined;
    if (input?.text) {
      this.events.onInputTranscript?.(input.text);
      this.discardOutputUntilInputTurn = false;
      if (!this.speechActive) this.setState('thinking');
    }
    if (output?.text) this.events.onOutputTranscript?.(output.text);
    if (content?.interrupted) {
      this.output.clear();
      this.discardOutputUntilInputTurn = false;
      this.responseActive = false;
      this.setState(this.speechActive ? 'userSpeaking' : 'thinking');
    }
    const parts = (content?.modelTurn as { parts?: Record<string, unknown>[] } | undefined)?.parts || [];
    for (const part of parts) {
      const inlineData = part.inlineData as { data?: string; mimeType?: string } | undefined;
      if (inlineData?.data && !this.discardOutputUntilInputTurn) {
        this.responseActive = true;
        this.responseAudioChunks += 1;
        if (!this.firstOutputAt) {
          this.firstOutputAt = Date.now();
          if (LIVE_DIAGNOSTICS) console.log(`[live-client] requestId=${this.requestId} first_output_audio elapsedFromMicMs=${this.firstInputAt ? this.firstOutputAt - this.firstInputAt : 'unknown'}`);
        }
        if (LIVE_DIAGNOSTICS && (this.responseAudioChunks === 1 || this.responseAudioChunks % 10 === 0)) {
          console.log(`[live-client] requestId=${this.requestId} response audio chunks=${this.responseAudioChunks}`);
        }
        void this.output.enqueue(inlineData.data, 24000, 1).catch(() => this.fail('Audio connection was interrupted.', generation));
      }
    }
    if (content?.turnComplete) {
      this.responseActive = false;
      if (!this.output.isBusy && !this.speechActive) this.setState('connected');
    }
  }

  private setState(state: LiveSessionState, error?: string): void {
    this.state = state;
    this.events.onStateChange?.(state, error);
  }

  private fail(message: string, generation = this.generation): void {
    if (generation !== this.generation || this.stopping || this.state === 'failed' || this.state === 'ended') return;
    this.clearConnectionTimer();
    this.clearSetupTimer();
    const error = new Error(message);
    this.startReject?.(error);
    this.startReject = undefined;
    this.startResolve = undefined;
    this.setState('failed', message);
    const socket = this.socket;
    this.socket = undefined;
    this.output.stop();
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) socket.close();
  }

  private clearSetupTimer(): void {
    if (this.setupTimer) clearTimeout(this.setupTimer);
    this.setupTimer = undefined;
  }

  private clearConnectionTimer(): void {
    if (this.connectionTimer) clearTimeout(this.connectionTimer);
    this.connectionTimer = undefined;
  }
}
