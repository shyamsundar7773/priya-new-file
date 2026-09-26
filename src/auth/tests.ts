import {
  backendHealthUrl,
  isSupabaseConfigured,
  isValidSupabasePublicKey,
  isValidSupabaseUrl,
  normalizeBackendUrl,
  resolveBackendUrl,
} from '../ai/config';
import { userStorageKeys } from '../storage/keys';
import { normalizePreferences } from '../storage/preferences';

export function runAuthContractTests(): void {
  const userA = userStorageKeys('user-a');
  const userB = userStorageKeys('user-b');
  if (userA.conversations === userB.conversations) throw new Error('user-scoped storage isolation failed');
  if (!userA.conversations.includes(encodeURIComponent('user-a'))) throw new Error('user ID missing from storage key');
  if (String(userA.companions) === String(userA.groups)) throw new Error('domain storage namespaces are not distinct');
  const preferences = normalizePreferences({ theme: 'light', notificationSettings: { newMessages: false } });
  if (preferences.theme !== 'light' || preferences.notificationSettings.newMessages !== false || preferences.notificationSettings.missedCalls !== true) {
    throw new Error('preferences normalization failed');
  }
  if (!isValidSupabaseUrl('https://example.supabase.co') || !isValidSupabasePublicKey('sb_publishable_example')) {
    throw new Error('valid Supabase client configuration was rejected');
  }
  if (isSupabaseConfigured('', 'sb_publishable_example') || isSupabaseConfigured('not-a-url', 'sb_publishable_example')) {
    throw new Error('missing or malformed Supabase URL was accepted');
  }
  if (isValidSupabasePublicKey('service_role_secret') || isValidSupabasePublicKey('your_supabase_anon_key')) {
    throw new Error('private or placeholder Supabase key was accepted');
  }
  if (resolveBackendUrl(' http://192.168.1.2:3000/ ') !== 'http://192.168.1.2:3000') {
    throw new Error('configured backend URL was not normalized');
  }
  if (resolveBackendUrl(undefined) !== 'http://10.0.2.2:3000') {
    throw new Error('Android emulator backend fallback changed');
  }
  if (backendHealthUrl('http://192.168.1.2:3000/chat/') !== 'http://192.168.1.2:3000') {
    throw new Error('backend health URL did not preserve the configured base');
  }
  if (normalizeBackendUrl(' https://example.test/// ') !== 'https://example.test') {
    throw new Error('backend URL normalization failed');
  }
}
