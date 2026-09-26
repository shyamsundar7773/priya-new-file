const { sanitizedProviderError } = require('./reliability');
const { synthesizeWithGemini } = require('./geminiVoice');

async function requestTextToSpeech({ apiKey, model, voice, text }) {
  if (!apiKey) throw Object.assign(new Error('Groq text-to-speech is not configured.'), { code: 'TTS_UNAVAILABLE' });
  return synthesizeWithGemini({ apiKey, model, voice, text });
}

module.exports = { requestTextToSpeech };
