import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../auth/supabase';
import { aiBackendUrl } from '../ai/config';

function endpoint(url: string): string {
  return url.replace(/\/+$/, '').replace(/\/chat$/, '') + '/voice/transcribe';
}

function requestId(): string {
  return `voice-stt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function safeClientFailure(error: unknown): string {
  if (error instanceof Error && error.name === 'TimeoutError') return 'timeout';
  if (error instanceof Error && /network|fetch|network request failed/i.test(error.message)) return 'network';
  if (error instanceof Error && /json|parse/i.test(error.message)) return 'json';
  return 'unknown';
}

export async function transcribeVoiceRecording(audioUri: string, correlationId?: string): Promise<{ text: string; provider: string }> {
  if (!aiBackendUrl) throw new Error('AI backend URL is not configured.');
  const session = await supabase?.auth.getSession();
  const token = session?.data.session?.access_token;
  if (!token) throw new Error('A signed-in session is required for voice transcription.');
  const id = correlationId || requestId();
  const url = endpoint(aiBackendUrl);
  const timeoutMs = 60_000;
  const startedAt = Date.now();
  try {
    const audioBase64 = await FileSystem.readAsStringAsync(audioUri, { encoding: FileSystem.EncodingType.Base64 });
    const extension = audioUri.split('?')[0].split('.').pop()?.toLowerCase();
    const mimeType = extension === 'wav' ? 'audio/wav' : extension === 'mp3' ? 'audio/mpeg' : extension === 'ogg' ? 'audio/ogg' : extension === 'webm' ? 'audio/webm' : 'audio/m4a';
    if (__DEV__) console.log(`[voice-stt-client] before_fetch requestId=${id} url=${url} mimeType=${mimeType} base64Length=${audioBase64.length} timeoutMs=${timeoutMs}`);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Request-Id': id },
      body: JSON.stringify({ audioBase64, mimeType }),
      signal: AbortSignal.timeout ? AbortSignal.timeout(timeoutMs) : undefined,
    });
    const data = await response.json().catch(() => null) as { text?: unknown; provider?: unknown; error?: unknown; code?: unknown } | null;
    const category = typeof data?.code === 'string' ? data.code : response.ok ? 'SUCCESS' : 'HTTP_ERROR';
    if (__DEV__) console.log(`[voice-stt-client] after_fetch requestId=${id} status=${response.status} durationMs=${Date.now() - startedAt} category=${category} success=${response.ok}`);
    if (!response.ok || typeof data?.text !== 'string' || !data.text.trim()) {
      throw new Error(typeof data?.error === 'string' ? data.error : 'Voice transcription is unavailable.');
    }
    return { text: data.text.trim(), provider: typeof data.provider === 'string' ? data.provider : 'configured-stt' };
  } catch (error: unknown) {
    if (__DEV__) console.warn(`[voice-stt-client] catch requestId=${id} errorName=${error instanceof Error ? error.name : 'UnknownError'} category=${safeClientFailure(error)} message=${error instanceof Error ? error.message : 'unknown error'}`);
    throw error;
  }
}
