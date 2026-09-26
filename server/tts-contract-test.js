const assert = require('node:assert/strict');
const { requestTextToSpeech } = require('./providers/tts');

async function main() {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
  });
  try {
    const result = await requestTextToSpeech({
      apiKey: 'test-key',
      model: 'test-model',
      voice: 'troy',
      text: 'Hello',
    });
    assert.equal(result.provider, 'groq');
    assert.equal(result.mimeType, 'audio/wav');
    assert.equal(result.model, 'test-model');
    assert.equal(result.voice, 'troy');
    assert.equal(result.audioBase64, 'AQID');
    console.log('TTS provider contract tests passed.');
  } finally {
    global.fetch = originalFetch;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
