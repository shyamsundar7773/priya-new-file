const assert = require('node:assert/strict');
const { requestGroq } = require('./providers/groq');
const { requestGemini } = require('./providers/gemini');
const { routeAI } = require('./providers/router');

function response(body, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

async function main() {
  global.fetch = async (url) => {
    if (url.includes('groq.com')) return response({ choices: [{ message: { content: 'Groq response' } }] });
    return response({ candidates: [{ content: { parts: [{ text: 'Gemini response' }] } }] });
  };

  const request = {
    userMessage: 'Hello',
    history: [],
    companion: { name: 'Priya', personality: 'Warm', language: 'Tamil & English' },
  };
  const groq = await requestGroq({ apiKey: 'test', model: 'test-groq', messages: [] });
  const gemini = await requestGemini({ apiKey: 'test', model: 'test-gemini', systemInstruction: 'Be natural', history: [], userMessage: 'Hello' });
  const routed = await routeAI(request, { groqApiKey: 'test', groqModels: ['test-groq'], geminiApiKey: 'test', geminiModels: ['test-gemini'] });

  assert.equal(groq.provider, 'groq');
  assert.equal(gemini.provider, 'gemini');
  assert.equal(routed.provider, 'groq');
  assert.equal(routed.text, 'Groq response');
  console.log('Stage 4 provider contract tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
