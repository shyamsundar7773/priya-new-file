import type { CompanionAIConfig, Message } from '../types';
import type { AudioStreamBuffer } from 'expo-audio';
import type { LiveSessionState, LiveVoiceContext } from './liveSession';

export type RecordingLifecycle = 'idle' | 'requesting-permission' | 'recording' | 'paused' | 'preview' | 'failed';
export type CallLifecycle = 'idle' | 'requesting-permission' | 'connecting' | 'connected' | 'reconnecting' | 'ending' | 'ended' | 'failed';

export interface VoiceMessageMetadata {
  audioUri?: string;
  duration: number;
  transcription?: string;
  waveform?: number[];
  playbackAvailable: boolean;
}

export interface SpeechToTextProvider {
  transcribe(audioUri: string): Promise<{ text: string; provider: string }>;
}

export interface TextToSpeechProvider {
  speak(text: string, voice?: CompanionAIConfig['voice'], requestId?: string): Promise<string>;
  stop(): Promise<void>;
}

export interface CallProvider {
  start(companionId: string, context?: LiveVoiceContext): Promise<void>;
  end(): Promise<void>;
  setMuted(muted: boolean): Promise<void>;
  setSpeaker(speaker: boolean): Promise<void>;
  sendAudio?(buffer: AudioStreamBuffer): void;
  getState?(): LiveSessionState | CallLifecycle;
  onStateChange?(listener: (state: LiveSessionState, error?: string) => void): () => void;
}

export interface VoiceMessageResult {
  message: Message;
  metadata: VoiceMessageMetadata;
}
