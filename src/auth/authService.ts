import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { googleAuthWebClientId } from '../ai/config';
import { supabase, supabaseConfigured } from './supabase';
import {
  buildGoogleOAuthOptions,
  completeGoogleOAuth,
  createOAuthRedirect,
  describeUrlForDiagnostics,
  inspectOAuthProviderUrl,
} from './oauthRedirect';

WebBrowser.maybeCompleteAuthSession();

function unavailable(): never {
  throw new Error('Supabase authentication is not configured.');
}

function message(error: { message?: string } | null): string {
  return error?.message || 'Authentication failed. Please try again.';
}

export async function signInWithPassword(email: string, password: string) {
  if (!supabaseConfigured || !supabase) return unavailable();
  const result = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (result.error) throw new Error(message(result.error));
  return result.data;
}

export async function signUpWithPassword(email: string, password: string) {
  if (!supabaseConfigured || !supabase) return unavailable();
  const result = await supabase.auth.signUp({ email: email.trim(), password });
  if (result.error) throw new Error(message(result.error));
  return result.data;
}

export async function signInWithGoogle() {
  if (!supabaseConfigured || !supabase) return unavailable();
  const client = supabase;
  if (!googleAuthWebClientId) throw new Error('Google authentication is not configured.');
  const { redirectTo, environment } = createOAuthRedirect(Linking.createURL, { allowWebLocalhost: Platform.OS === 'web' });
  console.info('[auth] OAuth redirect', { platform: Platform.OS, environment, redirectTo: describeUrlForDiagnostics(redirectTo) });
  const result = await client.auth.signInWithOAuth({ provider: 'google', options: buildGoogleOAuthOptions(redirectTo) });
  const providerUrlDiagnostics = inspectOAuthProviderUrl(result.data?.url, redirectTo);
  console.info('[auth] OAuth redirect diagnostic', {
    environment,
    resultError: result.error ? 'YES' : 'NO',
    resultData: result.data ? 'YES' : 'NO',
    resultDataUrl: providerUrlDiagnostics.urlExists ? 'YES' : 'NO',
    oauthHostname: providerUrlDiagnostics.hostname,
    oauthPathname: providerUrlDiagnostics.pathname,
    embeddedRedirectUri: providerUrlDiagnostics.embeddedRedirectUri,
    exactRedirectMatch: providerUrlDiagnostics.exactRedirectMatch ? 'YES' : 'NO',
  });
  if (result.error || !result.data.url) throw new Error(message(result.error));
  console.info('[auth] OAuth provider endpoint', describeUrlForDiagnostics(result.data.url));
  const browserResult = await WebBrowser.openAuthSessionAsync(result.data.url, redirectTo);
  if (browserResult.type === 'success' && browserResult.url) {
    console.info('[auth] OAuth callback', {
      callback: describeUrlForDiagnostics(browserResult.url),
      containsCode: new URL(browserResult.url).searchParams.has('code'),
    });
  }
  const exchanged = await completeGoogleOAuth(
    browserResult,
    redirectTo,
    (code) => client.auth.exchangeCodeForSession(code),
  );
  if (exchanged.error) throw new Error(message(exchanged.error));
  console.info('[auth] OAuth exchange succeeded');
  return exchanged.data;
}

export async function signOut() {
  if (!supabase) return;
  const result = await supabase.auth.signOut();
  if (result.error) throw new Error(message(result.error));
}

export async function getSession() {
  if (!supabase) return null;
  const result = await supabase.auth.getSession();
  if (result.error) throw new Error(message(result.error));
  return result.data.session;
}
