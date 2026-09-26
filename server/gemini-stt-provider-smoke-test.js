const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const config = require('./config');
const { transcribeAudio } = require('./providers/stt');

async function main() {
  const fixture = process.argv[2];
  if (!fixture) {
    console.log('STT smoke test BLOCKED — no speech-bearing fixture available.');
    process.exitCode = 2;
    return;
  }
  assert.ok(config.geminiApiKey, 'GEMINI_API_KEY is not configured in server/.env');
  const audioPath = path.resolve(fixture);
  const audioBase64 = fs.readFileSync(audioPath).toString('base64');
  const result = await transcribeAudio({
    apiKey: config.geminiApiKey,
    model: config.geminiSttModel,
    audioBase64,
    mimeType: 'audio/m4a',
  });
  assert.equal(result.provider, 'gemini');
  assert.ok(result.text.trim());
  console.log('Gemini STT provider smoke test passed with real transcription.');
}

main().catch((error) => {
  console.error(`Gemini STT provider smoke test failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exitCode = 1;
});
