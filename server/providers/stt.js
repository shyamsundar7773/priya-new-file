const ALLOWED_AUDIO_TYPES = new Set(['audio/flac', 'audio/m4a', 'audio/mp3', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/wav', 'audio/webm']);
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const { sanitizedProviderError } = require('./reliability');
const { transcribeWithGemini } = require('./geminiVoice');

function withTimeout(ms) {
  return AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined;
}

async function transcribeAudio({ apiKey, model, audioBase64, mimeType, requestId }) {
  if (!apiKey) throw Object.assign(new Error('Groq speech-to-text is not configured.'), { code: 'STT_UNAVAILABLE' });
  if (typeof audioBase64 !== 'string' || !audioBase64.trim()) throw Object.assign(new Error('Audio is required.'), { code: 'INVALID_AUDIO' });
  if (!ALLOWED_AUDIO_TYPES.has(mimeType)) throw Object.assign(new Error('Unsupported audio format.'), { code: 'INVALID_AUDIO' });

  let audio;
  try {
    audio = Buffer.from(audioBase64, 'base64');
  } catch {
    throw Object.assign(new Error('Audio data is malformed.'), { code: 'INVALID_AUDIO' });
  }
  if (!audio.length || audio.length > MAX_AUDIO_BYTES) throw Object.assign(new Error('Audio must be between 1 byte and 25 MB.'), { code: 'INVALID_AUDIO' });

  return transcribeWithGemini({ apiKey, model, audioBase64, mimeType, requestId });
}

module.exports = { transcribeAudio, ALLOWED_AUDIO_TYPES, MAX_AUDIO_BYTES };
