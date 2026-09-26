const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'priya-auth-'));

try {
  execFileSync(
    process.execPath,
    [path.join(projectRoot, 'node_modules/typescript/bin/tsc'), '--ignoreConfig', '--target', 'ES2022', '--module', 'commonjs', '--lib', 'ES2022,DOM', '--skipLibCheck', '--outDir', outputDir, path.join(projectRoot, 'src/auth/oauthRedirect.ts')],
    { cwd: projectRoot, stdio: 'inherit' },
  );

  const auth = require(path.join(outputDir, 'oauthRedirect.js'));
  const standalone = auth.createOAuthRedirect(() => 'priyacompanion://auth/callback');
  assert.equal(standalone.redirectTo, 'priyacompanion://auth/callback');
  assert.equal(standalone.environment, 'standalone');

  const expoGo = auth.createOAuthRedirect(() => 'exp://192.168.87.1:8081/--/auth/callback');
  assert.equal(expoGo.redirectTo, 'exp://192.168.87.1:8081/--/auth/callback');
  assert.equal(expoGo.environment, 'expo-go');
  assert.equal(new URL(expoGo.redirectTo).pathname, '/--/auth/callback');

  assert.throws(() => auth.createOAuthRedirect(() => 'http://localhost:3000/auth/callback'), /localhost/);
  assert.equal(
    auth.createOAuthRedirect(() => 'http://localhost:3000/auth/callback', { allowWebLocalhost: true }).environment,
    'web',
  );
  assert.deepEqual(auth.buildGoogleOAuthOptions(standalone.redirectTo), {
    redirectTo: standalone.redirectTo,
    skipBrowserRedirect: true,
  });
  const providerUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=public-client&redirect_uri=${encodeURIComponent(expoGo.redirectTo)}&state=opaque`;
  assert.deepEqual(auth.inspectOAuthProviderUrl(providerUrl, expoGo.redirectTo), {
    urlExists: true,
    hostname: 'accounts.google.com',
    pathname: '/o/oauth2/v2/auth',
    embeddedRedirectUri: expoGo.redirectTo,
    exactRedirectMatch: true,
  });
  assert.deepEqual(auth.inspectOAuthProviderUrl(undefined, expoGo.redirectTo), {
    urlExists: false,
    hostname: null,
    pathname: null,
    embeddedRedirectUri: null,
    exactRedirectMatch: false,
  });
  assert.deepEqual(auth.inspectOAuthProviderUrl('not a url', expoGo.redirectTo), {
    urlExists: true,
    hostname: null,
    pathname: null,
    embeddedRedirectUri: null,
    exactRedirectMatch: false,
  });

  let exchangedCode;
  const exchange = auth.completeGoogleOAuth(
    { type: 'success', url: 'priyacompanion://auth/callback?code=one-time-code&state=opaque' },
    standalone.redirectTo,
    async (code) => { exchangedCode = code; return { data: 'session' }; },
  );
  return exchange.then((result) => {
    assert.deepEqual(result, { data: 'session' });
    assert.equal(exchangedCode, 'one-time-code');
    assert.throws(() => auth.getOAuthCallbackCode('priyacompanion://wrong/path?code=x', standalone.redirectTo), /callback path/);
    assert.throws(() => auth.getOAuthCallbackCode('priyacompanion://auth/callback', standalone.redirectTo), /invalid session/);
    return auth.completeGoogleOAuth({ type: 'cancel' }, standalone.redirectTo, async () => null);
  }).then(() => {
    assert.fail('Cancelled browser flow should reject.');
  }, (error) => {
    assert.match(error.message, /cancelled/);
    assert.equal(auth.describeUrlForDiagnostics('https://accounts.google.com/o/oauth2/v2/auth?code=secret'), 'https://accounts.google.com/o/oauth2/v2/auth');
    assert.equal(auth.describeUrlForDiagnostics('not a url'), '[invalid-url]');
    console.log('OAuth redirect contracts passed.');
  });
} finally {
  fs.rmSync(outputDir, { recursive: true, force: true });
}
