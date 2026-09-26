import type { Message } from '../types';

export function createVoiceMessageRequestId(): string {
  return `voice-message-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createVoiceMessageTimer(): () => number {
  const startedAt = Date.now();
  return () => Date.now() - startedAt;
}

export function safeVoiceMessageFailureReason(error: unknown): string {
  if (!(error instanceof Error)) return 'unknown';
  if (error.name === 'TimeoutError' || /timeout/i.test(error.message)) return 'timeout';
  if (/network|fetch/i.test(error.message)) return 'network';
  if (/audio|playback/i.test(error.message)) return 'audio';
  if (/transcrib|speech/i.test(error.message)) return 'stt';
  if (/provider|response|request/i.test(error.message)) return 'provider';
  return error.name.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'unknown';
}

export function createVoiceUserMessage(
  id: string,
  audioUri: string | undefined,
  duration: number,
  timestamp = new Date(),
): Message {
  return {
    id,
    fromMe: true,
    type: 'voice',
    voiceDuration: duration,
    voiceAudioUri: audioUri,
    voicePlaybackAvailable: Boolean(audioUri),
    status: 'sending',
    timestamp,
    voicePlayState: 'idle',
    voicePlayProgress: 0,
  };
}

export function createAssistantVoiceMessage(
  id: string,
  text: string,
  audioUri: string,
  timestamp = new Date(),
): Message {
  return {
    id,
    fromMe: false,
    type: 'voice',
    text,
    voiceAudioUri: audioUri,
    voicePlaybackAvailable: true,
    status: 'delivered',
    timestamp,
    voicePlayState: 'idle',
    voicePlayProgress: 0,
  };
}

export async function retryVoiceOperation<T>(operation: () => Promise<T>, attempts = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Voice operation failed.');
}
