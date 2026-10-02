import { setAudioModeAsync } from 'expo-audio';
import type { CallProvider } from './types';
import type { LiveVoiceContext } from './liveSession';
import { GeminiLiveCallProvider } from './geminiLiveCallProvider';
import { SingleFlight } from './callState';

export class CallService {
  private endPromise?: Promise<void>;
  private readonly startFlight = new SingleFlight<void>();
  private generation = 0;

  constructor(private readonly provider: CallProvider = new GeminiLiveCallProvider()) {}

  setSemanticTurnHandler(handler: (turnText: string) => void): void {
    this.provider.setSemanticTurnHandler?.(handler);
  }

  start(companionId: string, context?: LiveVoiceContext): Promise<void> {
    return this.startFlight.run(async () => {
      const generation = ++this.generation;
      this.endPromise = undefined;
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true, shouldRouteThroughEarpiece: false });
      if (generation !== this.generation) return;
      await this.provider.start(companionId, context);
      if (generation !== this.generation) await this.provider.end();
    });
  }

  end(): Promise<void> {
    this.generation += 1;
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
  setListening(): void { this.provider.setListening?.(); }
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
