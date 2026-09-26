const assert = require('node:assert/strict');
const config = require('./config');
const { requestTextToSpeech } = require('./providers/tts');

async function main() {
  assert.ok(config.geminiApiKey, 'GEMINI_API_KEY is not configured in server/.env');
  const result = await requestTextToSpeech({
    apiKey: config.geminiApiKey,
    model: config.geminiTtsModel,
    voice: config.geminiTtsVoice,
    text: 'Hello, this is a voice test.',
  });
  assert.equal(result.provider, 'gemini');
  assert.equal(typeof result.audioBase64, 'string');
  assert.ok(result.audioBase64.length > 0);
  assert.equal(result.mimeType, 'audio/wav');
  assert.equal(Buffer.from(result.audioBase64, 'base64').subarray(0, 4).toString(), 'RIFF');
  console.log('Gemini TTS provider smoke test passed with real provider audio.');
}

main().catch((error) => {
  console.error(`TTS provider smoke test failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exitCode = 1;
});
