const assert = require('node:assert/strict');
const fs = require('node:fs');
const { classifyProviderError, isRetryableFailure, sanitizedProviderError } = require('./providers/reliability');

assert.equal(classifyProviderError(Object.assign(new Error(), { code: 'INVALID_REQUEST' })), 'invalid_request');
assert.equal(classifyProviderError(Object.assign(new Error(), { name: 'TimeoutError' })), 'timeout');
assert.equal(classifyProviderError(Object.assign(new Error(), { status: 429 })), 'rate_limit');
assert.equal(isRetryableFailure(Object.assign(new Error(), { code: 'TIMEOUT' })), true);
assert.equal(isRetryableFailure(Object.assign(new Error(), { code: 'INVALID_REQUEST' })), false);
assert.equal(sanitizedProviderError(Object.assign(new Error('secret provider detail'), { code: 'MALFORMED_RESPONSE' })).message, 'The AI provider returned an invalid response.');

const router = fs.readFileSync(require.resolve('./providers/router'), 'utf8');
assert.match(router, /failureClass/);
assert.match(router, /invalid_request/);
assert.match(router, /requestId/);
for (const file of ['./providers/groq', './providers/gemini', './providers/stt', './providers/tts']) {
  const source = fs.readFileSync(require.resolve(file), 'utf8');
  assert.match(source, /providerTimeout|withTimeout/);
}
console.log('Stage 16 provider reliability contracts passed.');
