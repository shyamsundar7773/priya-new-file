const fallbackAiBackendUrl = 'http://10.0.2.2:3000';

export function normalizeBackendUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

export function resolveBackendUrl(configuredUrl: string | undefined, fallbackUrl = fallbackAiBackendUrl): string {
  return normalizeBackendUrl(configuredUrl || fallbackUrl);
}

export function backendHealthUrl(baseUrl: string): string {
  return normalizeBackendUrl(baseUrl).replace(/\/chat$/, '');
}

export const aiBackendUrl = resolveBackendUrl(process.env.EXPO_PUBLIC_AI_BACKEND_URL);
export const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() || '';
export const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() || '';
export const googleAuthWebClientId = process.env.EXPO_PUBLIC_GOOGLE_AUTH_WEB_CLIENT_ID?.trim() || '';

export function isValidSupabaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || url.protocol === 'http:') && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function isValidSupabasePublicKey(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.includes('service_role') || normalized.includes('secret')) return false;
  if (normalized.includes('your_supabase') || normalized.includes('replace_me') || normalized.includes('placeholder')) return false;
  return normalized.startsWith('sb_publishable_') || normalized.split('.').length === 3;
}

export function isSupabaseConfigured(url: string, publicKey: string): boolean {
  return isValidSupabaseUrl(url.trim()) && isValidSupabasePublicKey(publicKey);
}

export function isAIBackendConfigured(): boolean {
  return aiBackendUrl.length > 0;
}
