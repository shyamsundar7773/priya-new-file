const assert = require('node:assert/strict');
const { routeAI } = require('./providers/router');
const { transcribeAudio } = require('./providers/stt');
const { requestTextToSpeech } = require('./providers/tts');

async function main() {
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'Context-aware response' } }] }),
    };
  };

  const result = await routeAI({
    userMessage: 'What should I drink this morning?',
    history: [{ type: 'text', fromMe: true, text: 'I had a busy morning.' }],
    companion: {
      id: 'priya',
      name: 'Priya',
      tagline: 'A warm companion',
      personality: 'Warm and playful',
      language: 'Tamil & English',
      aiConfig: {
        personality: { warmth: 90, playfulness: 70, depth: 80, formality: 20 },
        language: { primary: 'Tamil', secondary: 'English', codeSwitching: true },
      },
    },
    attachedContext: {
      memories: [{ text: 'The user prefers tea in the morning', importance: 0.8, confidence: 0.9 }],
      relationship: { stage: 'familiar', familiarity: 20, trust: 10, closeness: 8 },
      shortTerm: [{ type: 'text', fromMe: true, text: 'I had a busy morning.' }],
      proactive: ['Follow up on the morning routine'],
    },
    timing: {},
  }, { groqApiKey: 'test-groq', groqModels: ['test-model'], geminiApiKey: '', geminiModels: [] });

  assert.equal(result.provider, 'groq');
  assert.equal(result.text, 'Context-aware response');
  const body = JSON.parse(calls[0].options.body);
  const system = body.messages.find((message) => message.role === 'system').content;
  assert.match(system, /The user prefers tea/);
  assert.match(system, /familiar/);
  assert.match(system, /code-switch/);

  global.fetch = async () => ({
    ok: false,
    status: 429,
    json: async () => ({ error: { message: 'rate limited' } }),
  });
  await assert.rejects(
    routeAI({ userMessage: 'hello', history: [], companion: { name: 'Priya' }, timing: {} }, { groqApiKey: 'test-groq', groqModels: ['test-model'], geminiApiKey: '', geminiModels: [] }),
    (error) => error.code === 'PROVIDER_FAILURE' && /rate limited/.test(error.message),
  );
  await assert.rejects(
    routeAI({ userMessage: 'hello', history: [], companion: { name: 'Priya' }, timing: {} }, { groqApiKey: '', groqModels: ['test-model'], geminiApiKey: '', geminiModels: ['test-model'] }),
    (error) => error.code === 'PROVIDER_NOT_CONFIGURED',
  );

  await assert.rejects(
    transcribeAudio({ apiKey: '', model: 'test', audioBase64: 'AA==', mimeType: 'audio/wav' }),
    (error) => error.code === 'STT_UNAVAILABLE',
  );
  await assert.rejects(
    requestTextToSpeech({ apiKey: '', model: 'test', voice: 'troy', text: 'hello' }),
    (error) => error.code === 'TTS_UNAVAILABLE',
  );

  console.log('Stage 9 integration contract tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
