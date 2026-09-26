const http = require('node:http');
const config = require('./config');
const { routeAI } = require('./providers/router');
const { requestTextToSpeech } = require('./providers/tts');
const { attachLiveProxy } = require('./liveProxy');
const { transcribeAudio } = require('./providers/stt');
const { randomUUID } = require('node:crypto');
const { bindAuthenticatedIdentity, publicError, originAllowed } = require('./security');

function sendJson(res, status, body, origin) {
  const corsOrigin = originAllowed(origin, config.allowedOrigins) ? (origin || config.allowedOrigins[0]) : 'null';
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': corsOrigin,
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Request-Id',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  });
  res.end(JSON.stringify(body));
}

function readJson(req, maxBytes = 1_000_000) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > maxBytes) reject(new Error('Request body is too large.'));
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } catch { reject(new Error('Malformed JSON request.')); }
    });
    req.on('error', reject);
  });
}

const voiceDiagnosticsEnabled = process.env.NODE_ENV !== 'production';

function logVoice(category, fields) {
  if (voiceDiagnosticsEnabled) console.log(`[voice-${category}] timestamp=${new Date().toISOString()} ${fields}`);
}

function safeProviderFields(error) {
  return `operation=${error?.operation || 'unknown'} endpoint=${error?.upstreamEndpoint || 'https://generativelanguage.googleapis.com/v1beta/interactions'} status=${error?.upstreamStatus || 'unknown'} upstreamCode=${error?.upstreamCode || 'unknown'} category=${error?.failureClass || error?.code || 'unknown'} message=${error instanceof Error ? error.message : 'unknown provider failure'}`;
}

let jwks;
async function authenticatedUser(req) {
  if (!config.supabaseUrl) throw Object.assign(new Error('Supabase server configuration is required.'), { code: 'AUTHENTICATION' });
  const authorization = req.headers.authorization || '';
  if (!authorization.startsWith('Bearer ')) throw Object.assign(new Error('Bearer authentication is required.'), { code: 'AUTHENTICATION' });
  const token = authorization.slice('Bearer '.length).trim();
  if (!token) throw Object.assign(new Error('Bearer authentication is required.'), { code: 'AUTHENTICATION' });
  const { jwtVerify, createRemoteJWKSet } = await import('jose');
  jwks ||= createRemoteJWKSet(new URL(`${config.supabaseUrl.replace(/\/+$/, '')}/auth/v1/.well-known/jwks.json`));
  const verified = await jwtVerify(token, jwks, {
    issuer: `${config.supabaseUrl.replace(/\/+$/, '')}/auth/v1`,
    audience: config.supabaseJwtAudience,
  });
  if (typeof verified.payload.sub !== 'string') throw Object.assign(new Error('Authenticated user identity is missing.'), { code: 'AUTHENTICATION' });
  return { id: verified.payload.sub };
}

function createServer() {
  const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') return sendJson(res, 204, {}, req.headers.origin);
    if (req.method === 'GET' && req.url === '/') {
      return sendJson(res, 200, {
        service: 'Priya Companion AI Backend',
        status: 'running',
      }, req.headers.origin);
    }
    if (req.method === 'GET' && req.url === '/health') {
      return sendJson(res, 200, { status: 'ok' }, req.headers.origin);
    }
    if (req.method !== 'POST' || !['/chat', '/tts', '/voice/transcribe'].includes(req.url)) return sendJson(res, 404, { error: 'Not found.' }, req.headers.origin);
    const requestedRequestId = typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'].slice(0, 128) : '';
    const requestId = requestedRequestId || randomUUID();
    const isVoiceRoute = req.url === '/voice/transcribe' || req.url === '/tts';
    const receivedAt = Date.now();
    if (isVoiceRoute) logVoice(req.url === '/voice/transcribe' ? 'stt' : 'tts', `request_received requestId=${requestId} method=${req.method} path=${req.url}`);
    res.setHeader('X-Request-Id', requestId);
    try {
      if (req.url === '/chat') console.log(`[chat-timing] backend_received requestId=${requestId}`);
      const user = await authenticatedUser(req);
      if (isVoiceRoute) logVoice(req.url === '/voice/transcribe' ? 'stt' : 'tts', `auth_ok requestId=${requestId} elapsedMs=${Date.now() - receivedAt}`);
      const request = await readJson(req, req.url === '/voice/transcribe' ? 15_000_000 : 1_000_000);
      if (req.url === '/voice/transcribe') {
        if (typeof request.audioBase64 !== 'string' || !request.audioBase64) {
          logVoice('stt', `response_sent requestId=${requestId} status=400 category=INVALID_AUDIO elapsedMs=${Date.now() - receivedAt}`);
          return sendJson(res, 400, { error: 'audioBase64 is required.' }, req.headers.origin);
        }
        const mimeType = typeof request.mimeType === 'string' ? request.mimeType : 'audio/m4a';
        const byteLength = Buffer.byteLength(request.audioBase64, 'base64');
        logVoice('stt', `audio_received requestId=${requestId} mimeType=${mimeType} byteLength=${byteLength}`);
        logVoice('stt', `provider_start requestId=${requestId} provider=Gemini model=${config.geminiSttModel}`);
        let result;
        try {
          result = await transcribeAudio({ apiKey: config.geminiApiKey, model: config.geminiSttModel, audioBase64: request.audioBase64, mimeType, requestId });
          logVoice('stt', `provider_result requestId=${requestId} status=200 category=success elapsedMs=${Date.now() - receivedAt} success=true`);
        } catch (error) {
          logVoice('stt', `provider_result requestId=${requestId} ${safeProviderFields(error)} elapsedMs=${Date.now() - receivedAt} success=false`);
          throw error;
        }
        logVoice('stt', `response_sent requestId=${requestId} status=200 elapsedMs=${Date.now() - receivedAt}`);
        return sendJson(res, 200, result, req.headers.origin);
      }
      if (req.url === '/tts') {
        if (typeof request.text !== 'string' || !request.text.trim() || request.text.length > 4000) {
          logVoice('tts', `response_sent requestId=${requestId} status=400 category=INVALID_REQUEST elapsedMs=${Date.now() - receivedAt}`);
          return sendJson(res, 400, { error: 'text is required and must be at most 4000 characters.' }, req.headers.origin);
        }
        if (!config.geminiApiKey) {
          logVoice('tts', `response_sent requestId=${requestId} status=503 category=UNAVAILABLE elapsedMs=${Date.now() - receivedAt}`);
          return sendJson(res, 503, { error: 'Text-to-speech provider is not configured.', code: 'UNAVAILABLE' }, req.headers.origin);
        }
        logVoice('tts', `provider_start requestId=${requestId} provider=Gemini model=${config.geminiTtsModel} textLength=${request.text.trim().length}`);
        let result;
        try {
          result = await requestTextToSpeech({ apiKey: config.geminiApiKey, model: config.geminiTtsModel, voice: config.geminiTtsVoice, text: request.text.trim() });
          logVoice('tts', `provider_result requestId=${requestId} status=200 category=success audioByteLength=${Buffer.byteLength(result.audioBase64, 'base64')} elapsedMs=${Date.now() - receivedAt} success=true`);
        } catch (error) {
          logVoice('tts', `provider_result requestId=${requestId} ${safeProviderFields(error)} elapsedMs=${Date.now() - receivedAt} success=false`);
          throw error;
        }
        logVoice('tts', `response_sent requestId=${requestId} status=200 elapsedMs=${Date.now() - receivedAt}`);
        return sendJson(res, 200, result, req.headers.origin);
      }
      if (typeof request.userMessage !== 'string' || !request.userMessage.trim() || !request.companion) {
        return sendJson(res, 400, { error: 'userMessage and companion are required.' }, req.headers.origin);
      }
      const timing = { requestId, receivedAt };
      console.log(`[chat-timing] request_validated requestId=${requestId} historyCount=${Array.isArray(request.history) ? request.history.length : 0} userMessageChars=${typeof request.userMessage === 'string' ? request.userMessage.length : 0}`);
      const result = await routeAI({ ...bindAuthenticatedIdentity(request, user.id), timing }, config);
      const backendMs = Date.now() - receivedAt;
      console.log(`[chat-timing] backend_response requestId=${requestId} provider=${result.provider || timing.provider || 'unknown'} model=${result.model || timing.model || 'unknown'} durationMs=${backendMs} providerDurationMs=${timing.providerMs ?? 'unknown'}`);
      res.setHeader('X-Request-Id', requestId);
      res.setHeader('X-Backend-Duration-Ms', String(backendMs));
      res.setHeader('X-Provider-Duration-Ms', String(timing.providerMs ?? ''));
      return sendJson(res, 200, { ...result, status: 'success', timing: { requestId, backendMs, providerMs: timing.providerMs ?? null } }, req.headers.origin);
    } catch (error) {
      const response = publicError(error);
      if (isVoiceRoute) logVoice(req.url === '/voice/transcribe' ? 'stt' : 'tts', `response_sent requestId=${requestId} status=${response.status} category=${response.code} elapsedMs=${Date.now() - receivedAt}`);
      return sendJson(res, response.status, { error: response.message, code: response.code }, req.headers.origin);
    }
  });

  attachLiveProxy(server, { authenticate: authenticatedUser, config });
  return server;
}

function startServer(options = {}) {
  const server = createServer();
  const host = options.host || config.host;
  const port = Number(options.port ?? config.port);

  server.listen(port, host, () => {
    console.log(`Priya Companion AI backend listening on ${host}:${port}`);
    console.log(`Groq configured: ${Boolean(config.groqApiKey)}; Gemini configured: ${Boolean(config.geminiApiKey)}`);
  });

  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = { startServer, createServer, authenticatedUser };
