export const AUTH_CALLBACK_PATH = 'auth/callback';
export const STANDALONE_SCHEME = 'priyacompanion';

export type OAuthRedirectEnvironment = 'expo-go' | 'standalone' | 'web' | 'unknown';

export function createOAuthRedirect(
  createURL: (path: string) => string,
  options: { allowWebLocalhost?: boolean } = {},
): {
  redirectTo: string;
  environment: OAuthRedirectEnvironment;
} {
  const redirectTo = createURL(AUTH_CALLBACK_PATH);
  const parsed = new URL(redirectTo);
  const environment = identifyOAuthRedirectEnvironment(parsed);

  if (environment === 'web' && parsed.hostname === 'localhost' && !options.allowWebLocalhost) {
    throw new Error('Mobile Google sign-in cannot use a localhost callback.');
  }
  if (environment === 'unknown') {
    throw new Error('Google sign-in returned an unsupported callback URL.');
  }

  return { redirectTo, environment };
}

export function identifyOAuthRedirectEnvironment(url: URL): OAuthRedirectEnvironment {
  if (url.protocol === 'exp:') return 'expo-go';
  if (url.protocol === `${STANDALONE_SCHEME}:`) return 'standalone';
  if (url.protocol === 'http:' || url.protocol === 'https:') return 'web';
  return 'unknown';
}

export function buildGoogleOAuthOptions(redirectTo: string) {
  return {
    redirectTo,
    skipBrowserRedirect: true,
  } as const;
}

export function describeUrlForDiagnostics(value: string): string {
  try {
    const parsed = new URL(value);
    return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  } catch {
    return '[invalid-url]';
  }
}

export function getEmbeddedRedirectUri(oAuthUrl: string): string | null {
  try {
    return new URL(oAuthUrl).searchParams.get('redirect_uri');
  } catch {
    return null;
  }
}

export function inspectOAuthProviderUrl(oAuthUrl: string | null | undefined, redirectTo: string) {
  if (!oAuthUrl) {
    return {
      urlExists: false,
      hostname: null,
      pathname: null,
      embeddedRedirectUri: null,
      exactRedirectMatch: false,
    };
  }

  try {
    const parsed = new URL(oAuthUrl);
    const embeddedRedirectUri = parsed.searchParams.get('redirect_uri');
    return {
      urlExists: true,
      hostname: parsed.hostname,
      pathname: parsed.pathname,
      embeddedRedirectUri,
      exactRedirectMatch: embeddedRedirectUri === redirectTo,
    };
  } catch {
    return {
      urlExists: true,
      hostname: null,
      pathname: null,
      embeddedRedirectUri: null,
      exactRedirectMatch: false,
    };
  }
}

export function getOAuthCallbackCode(callbackUrl: string, redirectTo: string): string {
  const callback = new URL(callbackUrl);
  const expectedPath = new URL(redirectTo).pathname.replace(/\/+$/, '');
  const actualPath = callback.pathname.replace(/\/+$/, '');

  if (!actualPath.endsWith(expectedPath)) {
    throw new Error('Google sign-in returned an invalid callback path.');
  }

  const code = callback.searchParams.get('code');
  if (!code) throw new Error('Google sign-in returned an invalid session.');
  return code;
}

export async function completeGoogleOAuth<T>(
  browserResult: { type: string; url?: string },
  redirectTo: string,
  exchangeCodeForSession: (code: string) => Promise<T>,
): Promise<T> {
  if (browserResult.type !== 'success') throw new Error('Google sign-in was cancelled.');
  if (!browserResult.url) throw new Error('Google sign-in returned an invalid callback.');
  const code = getOAuthCallbackCode(browserResult.url, redirectTo);
  return exchangeCodeForSession(code);
}
