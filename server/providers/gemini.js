const { providerTimeout, sanitizedProviderError } = require('./reliability');

async function requestGemini({ apiKey, model, systemInstruction, history, userMessage }) {
  const contents = [
    ...history.filter((message) => message.type === 'text' && message.text).map((message) => ({
      role: message.fromMe ? 'user' : 'model',
      parts: [{ text: message.text }],
    })),
    { role: 'user', parts: [{ text: userMessage }] },
  ];
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents,
      generationConfig: { temperature: 0.8, maxOutputTokens: 800 },
    }),
    signal: providerTimeout(),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw sanitizedProviderError(Object.assign(new Error(), { status: response.status, code: response.status === 400 ? 'INVALID_REQUEST' : response.status === 401 || response.status === 403 ? 'INVALID_CREDENTIALS' : response.status === 429 ? 'RATE_LIMIT' : 'UNAVAILABLE' }));
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw sanitizedProviderError(Object.assign(new Error(), { code: 'MALFORMED_RESPONSE' }));
  return { text, provider: 'gemini', model };
}

module.exports = { requestGemini };
