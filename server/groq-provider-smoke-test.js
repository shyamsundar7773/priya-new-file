const assert = require('node:assert/strict');
const config = require('./config');
const { requestGroq } = require('./providers/groq');

async function main() {
  assert.ok(config.groqApiKey, 'GROQ_API_KEY is not configured in server/.env');
  assert.equal(config.groqModels[0], 'openai/gpt-oss-20b', 'verified Groq model is not configured first');

  const result = await requestGroq({
    apiKey: config.groqApiKey,
    model: config.groqModels[0],
    messages: [{ role: 'user', content: 'Say hello in one short sentence.' }],
  });

  assert.equal(result.provider, 'groq');
  assert.equal(result.model, 'openai/gpt-oss-20b');
  assert.equal(typeof result.text, 'string');
  assert.ok(result.text.trim().length > 0);
  console.log('Groq provider smoke test passed with a real provider response.');
}

main().catch((error) => {
  console.error(`Groq provider smoke test failed: ${error instanceof Error ? error.message : 'unknown error'}`);
  process.exitCode = 1;
});
