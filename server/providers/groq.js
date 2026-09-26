const { providerTimeout, sanitizedProviderError } = require('./reliability');

async function requestGroq({ apiKey, model, messages }) {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, temperature: 0.8, max_completion_tokens: 800 }),
    signal: providerTimeout(),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw sanitizedProviderError(Object.assign(new Error(), { status: response.status, code: response.status === 400 ? 'INVALID_REQUEST' : response.status === 401 ? 'INVALID_CREDENTIALS' : response.status === 429 ? 'RATE_LIMIT' : 'UNAVAILABLE' }));
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) throw sanitizedProviderError(Object.assign(new Error(), { code: 'MALFORMED_RESPONSE' }));
  return { text, provider: 'groq', model };
}

module.exports = { requestGroq };
