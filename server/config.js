function parseList(value, fallback) {
  return (value || fallback).split(',').map((item) => item.trim()).filter(Boolean);
}

function loadEnvFile() {
  try {
    const fs = require('node:fs');
    const path = require('node:path');
    const file = path.join(process.cwd(), 'server', '.env');
    if (!fs.existsSync(file)) return;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]] !== undefined) continue;
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
    }
  } catch {
    // Environment variables may be supplied by the shell or deployment platform.
  }
}

loadEnvFile();

module.exports = {
  host: process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1'),
  port: Number(process.env.PORT || (process.env.NODE_ENV === 'production' ? 10000 : 3000)),
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseJwtAudience: process.env.SUPABASE_JWT_AUDIENCE || 'authenticated',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiSttModel: process.env.GEMINI_STT_MODEL || 'gemini-3.5-transcribe',
  geminiTtsModel: process.env.GEMINI_TTS_MODEL || 'gemini-3.8-flash-lite-tts',
  geminiTtsVoice: process.env.GEMINI_TTS_VOICE || 'Kore',
  groqApiKey: process.env.GROQ_API_KEY || '',
  groqSttModel: process.env.GROQ_STT_MODEL || 'whisper-large-v3-turbo',
  groqTtsModel: process.env.GROQ_TTS_MODEL || 'canopylabs/orpheus-v1-english',
  groqTtsVoice: process.env.GROQ_TTS_VOICE || 'troy',
  geminiLiveModel: process.env.GEMINI_LIVE_MODEL || 'gemini-3.8-live',
  sttProviderUrl: process.env.STT_PROVIDER_URL || '',
  sttApiKey: process.env.STT_API_KEY || '',
  geminiModels: parseList(process.env.GEMINI_MODELS, 'gemini-2.5-flash'),
  groqModels: parseList(process.env.GROQ_MODELS, 'llama-3.3-70b-versatile'),
  allowedOrigins: parseList(process.env.ALLOWED_ORIGINS, 'http://localhost:8081,http://localhost:19006,http://localhost:3000'),
};
