import { setAudioModeAsync } from 'expo-audio';
import type { CallProvider } from './types';
import type { LiveVoiceContext } from './liveSession';
import { GeminiLiveCallProvider } from './geminiLiveCallProvider';

export class CallService {
  private endPromise?: Promise<void>;

  constructor(private readonly provider: CallProvider = new GeminiLiveCallProvider()) {}

  async start(companionId: string, context?: LiveVoiceContext): Promise<void> {
    this.endPromise = undefined;
    await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true, shouldRouteThroughEarpiece: false });
    await this.provider.start(companionId, context);
  }

  end(): Promise<void> {
    if (!this.endPromise) {
      this.endPromise = (async () => {
        let cleanupError: unknown;
        let cleanupFailed = false;
        try {
          await this.provider.end();
        } catch (error: unknown) {
          cleanupError = error;
          cleanupFailed = true;
        }
        try {
          await setAudioModeAsync({ allowsRecording: false, shouldRouteThroughEarpiece: false });
        } catch (error: unknown) {
          if (!cleanupFailed) cleanupError = error;
          cleanupFailed = true;
        }
        if (cleanupFailed) throw cleanupError;
      })();
    }
    return this.endPromise;
  }

  setMuted(muted: boolean): Promise<void> { return this.provider.setMuted(muted); }
  setSpeaker(speaker: boolean): Promise<void> { return this.provider.setSpeaker(speaker); }
  getDiagnostics(): { sessionState: import('./liveSession').LiveSessionState | import('./types').CallLifecycle; websocketState: 'none' | 'connecting' | 'open' | 'closing' | 'closed'; outputBusy: boolean; muted: boolean } {
    const provider = this.provider as CallProvider & {
      getDiagnostics?: () => {
        sessionState: import('./liveSession').LiveSessionState;
        websocketState: 'none' | 'connecting' | 'open' | 'closing' | 'closed';
        outputBusy: boolean;
        muted: boolean;
      };
    };
    return provider.getDiagnostics?.() || {
      sessionState: provider.getState?.() || 'idle',
      websocketState: 'none',
      outputBusy: false,
      muted: false,
    };
  }
  sendAudio(buffer: import('expo-audio').AudioStreamBuffer): void { this.provider.sendAudio?.(buffer); }
  onStateChange(listener: (state: import('./liveSession').LiveSessionState, error?: string) => void): () => void {
    return this.provider.onStateChange?.(listener) || (() => undefined);
  }
}
