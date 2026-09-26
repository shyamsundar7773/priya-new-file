const DEFAULT_PROVIDER_TIMEOUT_MS = 60_000;

function providerTimeout(ms = DEFAULT_PROVIDER_TIMEOUT_MS) {
  return AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined;
}

function classifyProviderError(error) {
  if (error?.code === 'INVALID_REQUEST' || error?.code === 'INVALID_AUDIO' || error?.code === 'UNSUPPORTED_CAPABILITY') return 'invalid_request';
  if (error?.code === 'AUTHENTICATION' || error?.code === 'INVALID_CREDENTIALS') return 'authentication';
  if (error?.name === 'TimeoutError' || error?.code === 'TIMEOUT' || error?.code === 'ABORT_ERR') return 'timeout';
  if (error?.code === 'RATE_LIMIT' || error?.status === 429) return 'rate_limit';
  if (error?.code === 'UNAVAILABLE' || error?.code === 'NETWORK' || error?.code === 'ECONNRESET') return 'unavailable';
  if (error?.code === 'MALFORMED_RESPONSE') return 'malformed_response';
  return 'provider_error';
}

function isRetryableFailure(error) {
  return ['timeout', 'rate_limit', 'unavailable', 'provider_error'].includes(classifyProviderError(error));
}

function sanitizedProviderError(error, fallback = 'The AI provider request failed.') {
  const classification = classifyProviderError(error);
  const message = classification === 'timeout'
    ? 'The AI provider timed out.'
    : classification === 'rate_limit'
      ? 'The AI provider is rate limited.'
      : classification === 'authentication'
        ? 'The AI provider is not authenticated.'
        : classification === 'invalid_request'
          ? 'The AI provider rejected the request.'
          : classification === 'malformed_response'
            ? 'The AI provider returned an invalid response.'
            : fallback;
  return Object.assign(new Error(message), { code: classification.toUpperCase(), failureClass: classification });
}

module.exports = { DEFAULT_PROVIDER_TIMEOUT_MS, providerTimeout, classifyProviderError, isRetryableFailure, sanitizedProviderError };
