import { aiBackendUrl } from '../config';
import { supabase } from '../../auth/supabase';
import type { AIProvider, AIRequest, AIResponse } from '../types';

function endpoint(url: string): string {
  return url.replace(/\/+$/, '').endsWith('/chat') ? url.replace(/\/+$/, '') : `${url.replace(/\/+$/, '')}/chat`;
}

export class BackendAIProvider implements AIProvider {
  readonly id = 'backend';
  readonly name = 'Priya AI Backend';

  async generateResponse(request: AIRequest): Promise<AIResponse> {
    if (!aiBackendUrl) {
      return { status: 'error', provider: this.id, error: { code: 'UNAVAILABLE', message: 'AI backend URL is not configured.' } };
    }

    const requestId = request.requestId || `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      const session = await supabase?.auth.getSession();
      const accessToken = session?.data.session?.access_token;
      if (!accessToken) return { status: 'error', provider: this.id, error: { code: 'AUTHENTICATION', message: 'A signed-in session is required for the AI backend.' } };
      const sentAt = Date.now();
      if (__DEV__) console.log(`[chat-timing] send requestId=${requestId} historyCount=${request.history.length} contextChars=${JSON.stringify(request.history).length}`);
      const response = await fetch(endpoint(aiBackendUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(request),
      });
      const receivedAt = Date.now();
      if (__DEV__) console.log(`[chat-timing] client_received requestId=${requestId} status=${response.status} durationMs=${receivedAt - sentAt} backendDurationMs=${response.headers.get('X-Backend-Duration-Ms') || 'unknown'} providerDurationMs=${response.headers.get('X-Provider-Duration-Ms') || 'unknown'}`);
      const data = await response.json().catch(() => null) as { text?: unknown; provider?: unknown; model?: unknown; error?: unknown } | null;

      if (!response.ok) {
        const message = typeof data?.error === 'string' ? data.error : `AI backend error: ${response.status}`;
        const code = response.status === 401 || response.status === 403 ? 'AUTHENTICATION' : response.status === 408 || response.status === 504 ? 'TIMEOUT' : response.status === 422 ? 'MODEL_UNAVAILABLE' : 'PROVIDER_FAILURE';
        return { status: 'error', provider: typeof data?.provider === 'string' ? data.provider : this.id, model: typeof data?.model === 'string' ? data.model : undefined, error: { code, message } };
      }

      if (typeof data?.text !== 'string' || !data.text.trim()) {
        return { status: 'error', provider: this.id, error: { code: 'MALFORMED_RESPONSE', message: 'AI backend returned no response text.' } };
      }

      return { status: 'success', provider: typeof data.provider === 'string' ? data.provider : this.id, model: typeof data.model === 'string' ? data.model : undefined, text: data.text.trim() };
    } catch (error: unknown) {
      if (__DEV__) console.warn(`[chat-timing] client_failed requestId=${requestId} url=${endpoint(aiBackendUrl)} error=${error instanceof Error ? error.message : 'unknown'}`);
      return { status: 'error', provider: this.id, error: { code: 'UNAVAILABLE', message: 'AI backend is unavailable.' } };
    }
  }
}
