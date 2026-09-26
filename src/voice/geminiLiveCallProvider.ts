import type { AudioStreamBuffer } from 'expo-audio';
import { setAudioModeAsync } from 'expo-audio';
import type { CallProvider } from './types';
import { GeminiLiveSession, type LiveSessionEvents, type LiveSessionState, type LiveVoiceContext } from './liveSession';
import { claimActiveCall, releaseActiveCall } from './callState';

export class GeminiLiveCallProvider implements CallProvider {
  private session?: GeminiLiveSession;
  private state: LiveSessionState = 'idle';
  private muted = false;
  private generation = 0;
  private listeners = new Set<(state: LiveSessionState, error?: string) => void>();

  async start(_companionId: string, context?: LiveVoiceContext): Promise<void> {
    if (!context) throw new Error('Companion context is required for Gemini Live.');
    if (this.session) await this.end();
    await claimActiveCall(this, () => this.stopSession());
    const generation = ++this.generation;
    const events: LiveSessionEvents = {
      onStateChange: (state, error) => {
        if (generation !== this.generation || !this.session) return;
        this.state = state;
        this.listeners.forEach((listener) => listener(state, error));
      },
    };
    const session = new GeminiLiveSession(events);
    this.session = session;
    this.muted = false;
    try {
      await session.start(context);
    } catch (error) {
      if (generation === this.generation) await this.end();
      throw error;
    }
  }

  async end(): Promise<void> {
    await this.stopSession();
    await releaseActiveCall(this);
  }

  private async stopSession(): Promise<void> {
    const session = this.session;
    this.session = undefined;
    this.generation += 1;
    await session?.stop();
    this.state = 'ended';
  }

  async setMuted(muted: boolean): Promise<void> {
    this.muted = muted;
  }

  async setSpeaker(speaker: boolean): Promise<void> {
    await setAudioModeAsync({ shouldRouteThroughEarpiece: !speaker });
  }

  sendAudio(buffer: AudioStreamBuffer): void {
    if (!this.muted) this.session?.sendAudio(buffer);
  }

  getState(): LiveSessionState {
    return this.state;
  }

  getDiagnostics(): { sessionState: LiveSessionState; websocketState: 'none' | 'connecting' | 'open' | 'closing' | 'closed'; outputBusy: boolean; muted: boolean } {
    return {
      ...(this.session?.getDiagnostics() || { sessionState: this.state, websocketState: 'none' as const, outputBusy: false }),
      muted: this.muted,
    };
  }

  onStateChange(listener: (state: LiveSessionState, error?: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
