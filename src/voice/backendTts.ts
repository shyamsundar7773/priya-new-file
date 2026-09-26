import * as FileSystem from 'expo-file-system/legacy';
import type { CompanionAIConfig } from '../types';
import { aiBackendUrl } from '../ai/config';
import { supabase } from '../auth/supabase';
import type { TextToSpeechProvider } from './types';

function endpoint(url: string): string {
  const base = url.replace(/\/+$/, '');
  return base.endsWith('/tts') ? base : `${base}/tts`;
}

function requestId(): string {
  return `voice-tts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export class BackendTextToSpeechProvider implements TextToSpeechProvider {
  private currentUri?: string;

  async speak(text: string, voice?: CompanionAIConfig['voice'], correlationId?: string): Promise<string> {
    if (!aiBackendUrl) throw new Error('AI backend URL is not configured.');
    const session = await supabase?.auth.getSession();
    const accessToken = session?.data.session?.access_token;
    if (!accessToken) throw new Error('A signed-in session is required for text-to-speech.');
    const id = correlationId || requestId();
    const url = endpoint(aiBackendUrl);
    const startedAt = Date.now();
    if (__DEV__) console.log(`[voice-tts-client] before_fetch requestId=${id} url=${url} textLength=${text.length}`);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}`, 'X-Request-Id': id },
        body: JSON.stringify({ text, voice }),
      });
      const data = await response.json().catch(() => null) as { audioBase64?: unknown; mimeType?: unknown; error?: unknown; code?: unknown } | null;
      const category = typeof data?.code === 'string' ? data.code : response.ok ? 'SUCCESS' : 'HTTP_ERROR';
      if (__DEV__) console.log(`[voice-tts-client] after_fetch requestId=${id} status=${response.status} durationMs=${Date.now() - startedAt} category=${category} success=${response.ok}`);
      if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : `Text-to-speech error: ${response.status}`);
      if (typeof data?.audioBase64 !== 'string' || data.audioBase64.length === 0) throw new Error('Text-to-speech returned no audio.');
      const extension = data.mimeType === 'audio/mpeg' ? 'mp3' : data.mimeType === 'audio/wav' ? 'wav' : 'audio';
      const uri = `${FileSystem.cacheDirectory}priya-tts-${Date.now()}.${extension}`;
      await FileSystem.writeAsStringAsync(uri, data.audioBase64, { encoding: FileSystem.EncodingType.Base64 });
      const fileInfo = await FileSystem.getInfoAsync(uri);
      if (!fileInfo.exists || !('size' in fileInfo) || fileInfo.size <= 0) {
        throw new Error('Text-to-speech audio cache is empty.');
      }
      if (__DEV__) console.log(`[voice-tts-client] audio_cached requestId=${id} uri=${uri} mimeType=${typeof data.mimeType === 'string' ? data.mimeType : 'unknown'} byteLength=${fileInfo.size}`);
      this.currentUri = uri;
      return uri;
    } catch (error: unknown) {
      if (__DEV__) console.warn(`[voice-tts-client] catch requestId=${id} errorName=${error instanceof Error ? error.name : 'UnknownError'} message=${error instanceof Error ? error.message : 'unknown error'}`);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (this.currentUri) {
      await FileSystem.deleteAsync(this.currentUri, { idempotent: true }).catch(() => undefined);
      this.currentUri = undefined;
    }
  }
}
