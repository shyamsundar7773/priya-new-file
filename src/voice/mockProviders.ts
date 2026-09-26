import type { CompanionAIConfig } from '../types';
import type { CallLifecycle, CallProvider, SpeechToTextProvider, TextToSpeechProvider } from './types';

export class MockSpeechToTextProvider implements SpeechToTextProvider {
  async transcribe(_audioUri: string): Promise<{ text: string; provider: string }> {
    throw new Error('Speech-to-text provider is not configured.');
  }
}

export class MockTextToSpeechProvider implements TextToSpeechProvider {
  async speak(_text: string, _voice?: CompanionAIConfig['voice']): Promise<string> {
    throw new Error('Text-to-speech provider is not configured.');
  }
  async stop(): Promise<void> {}
}

export class MockCallProvider implements CallProvider {
  private state: CallLifecycle = 'idle';
  async start(): Promise<void> { this.state = 'connected'; }
  async end(): Promise<void> { this.state = 'ended'; }
  async setMuted(): Promise<void> {}
  async setSpeaker(): Promise<void> {}
  getState(): CallLifecycle { return this.state; }
}

export function voiceSettingsFor(companion: { aiConfig?: { voice: CompanionAIConfig['voice'] } }): CompanionAIConfig['voice'] {
  return companion.aiConfig?.voice || { style: 'Warm & Natural', pace: 50, warmth: 80 };
}
