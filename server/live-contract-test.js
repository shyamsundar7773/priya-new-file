const assert = require('node:assert/strict');
const { createGeminiSetup } = require('./liveProxy');

const setup = createGeminiSetup({
  systemInstruction: 'You are Priya. Personality: warm and playful.',
}, 'gemini-3.8-live');

assert.equal(setup.setup.model, 'models/gemini-3.8-live');
assert.deepEqual(setup.setup.generationConfig.responseModalities, ['AUDIO']);
assert.equal(setup.setup.systemInstruction.parts[0].text.includes('playful'), true);
assert.deepEqual(setup.setup.inputAudioTranscription, {});
assert.deepEqual(setup.setup.outputAudioTranscription, {});
assert.equal(setup.setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Aoede');
assert.equal(JSON.stringify(setup).includes('GEMINI_API_KEY'), false);
console.log('Gemini Live proxy contracts passed.');
