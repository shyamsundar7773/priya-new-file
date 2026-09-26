const WebSocket = require('ws');

const GEMINI_LIVE_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
const LIVE_DIAGNOSTICS = process.env.NODE_ENV !== 'production';
const PROVIDER_CONNECTION_TIMEOUT_MS = 15_000;

function sendJson(socket, body) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(body));
}

function safeProviderError(parsed) {
  const error = parsed?.error;
  if (!error || typeof error !== 'object') return null;
  return {
    type: typeof error.status === 'string' ? error.status : 'error',
    code: typeof error.code === 'number' || typeof error.code === 'string' ? error.code : undefined,
    message: typeof error.message === 'string' ? error.message : 'Gemini Live provider error.',
  };
}

function createGeminiSetup(context, model) {
  return {
    setup: {
      model: `models/${model}`,
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Aoede' } } },
      },
      systemInstruction: { parts: [{ text: context.systemInstruction }] },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
    },
  };
}

function validateLiveStartMessage(message) {
  if (!message || typeof message !== 'object') return 'Live session message is required.';
  if (message.type !== 'start') return 'Live session must start with a start message.';
  if (!message.context || typeof message.context.systemInstruction !== 'string' || !message.context.systemInstruction.trim()) {
    return 'Live companion context is required.';
  }
  if (message.context.systemInstruction.length > 12_000) return 'Live companion context is too large.';
  return null;
}

function authorizeLiveStartMessage(message, user) {
  const context = message?.context;
  if (!context || context.userId !== user.id) return 'Resource authorization failed.';
  if (!context.companion || typeof context.companion.id !== 'string' || !context.companion.id) return 'Selected companion is required.';
  if (context.groupId && typeof context.groupId !== 'string') return 'Invalid group context.';
  return null;
}

function attachLiveProxy(server, { authenticate, config }) {
  const clients = new WebSocket.Server({ noServer: true });

  server.on('upgrade', async (request, socket, head) => {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    if (url.pathname !== '/live') {
      socket.destroy();
      return;
    }
    try {
      const token = url.searchParams.get('access_token');
      if (!token) throw Object.assign(new Error('Bearer token is required.'), { code: 'AUTHENTICATION' });
      const user = await authenticate({ headers: { authorization: `Bearer ${token}` } });
      clients.handleUpgrade(request, socket, head, (client) => clients.emit('connection', client, user));
    } catch {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
    }
  });

  clients.on('connection', (client, user) => {
    let gemini;
    let closed = false;
    let inputFrames = 0;
    let inputBytes = 0;
    let responseMessages = 0;
    let responseAudioChunks = 0;
    let setupAcknowledged = false;
    let providerTimer;
    let requestId = 'unknown';
    const close = () => {
      if (closed) return;
      closed = true;
      if (LIVE_DIAGNOSTICS) console.log(`[live] requestId=${requestId} closed inputFrames=${inputFrames} inputBytes=${inputBytes} responseMessages=${responseMessages} responseAudioChunks=${responseAudioChunks}`);
      if (gemini && (gemini.readyState === WebSocket.OPEN || gemini.readyState === WebSocket.CONNECTING)) gemini.close();
      if (providerTimer) clearTimeout(providerTimer);
      if (client.readyState === WebSocket.OPEN) client.close();
    };
    const fail = (message) => {
      sendJson(client, { type: 'state', state: 'failed', error: message });
      close();
    };

    client.on('message', (raw) => {
      let message;
      try { message = JSON.parse(raw.toString()); } catch { fail('Malformed live session message.'); return; }
      if (message.type === 'start') {
        if (gemini) return;
        if (!config.geminiApiKey) { fail('Gemini Live is not configured on the server.'); return; }
        const validationError = validateLiveStartMessage(message);
        if (validationError) { fail(validationError); return; }
        const authorizationError = authorizeLiveStartMessage(message, user);
        if (authorizationError) { fail(authorizationError); return; }
        requestId = typeof message.context.requestId === 'string' && /^[A-Za-z0-9._-]{1,128}$/.test(message.context.requestId)
          ? message.context.requestId
          : 'unknown';
        if (LIVE_DIAGNOSTICS) console.log(`[live] requestId=${requestId} start model=${config.geminiLiveModel} contextChars=${message.context.systemInstruction.length}`);
        gemini = new WebSocket(`${GEMINI_LIVE_URL}?key=${encodeURIComponent(config.geminiApiKey)}`);
        providerTimer = setTimeout(() => fail('Gemini Live provider connection timed out.'), PROVIDER_CONNECTION_TIMEOUT_MS);
        gemini.on('open', () => {
          clearTimeout(providerTimer);
          providerTimer = undefined;
          gemini.send(JSON.stringify(createGeminiSetup(message.context, config.geminiLiveModel)));
          if (LIVE_DIAGNOSTICS) console.log(`[live] requestId=${requestId} Gemini websocket opened; setup sent`);
        });
        gemini.on('message', (payload) => {
          try {
            const parsed = JSON.parse(payload.toString());
            responseMessages += 1;
            const providerError = safeProviderError(parsed);
            if (providerError) {
              if (LIVE_DIAGNOSTICS) {
                console.log(`[live] provider error type=${providerError.type} code=${providerError.code ?? 'none'} message=${providerError.message}`);
              }
              fail(providerError.message);
              return;
            }
            if (parsed.setupComplete) {
              setupAcknowledged = true;
              if (LIVE_DIAGNOSTICS) console.log(`[live] requestId=${requestId} Gemini setup acknowledged type=setupComplete`);
              sendJson(client, { type: 'state', state: 'connected' });
            }
            responseAudioChunks += (parsed.serverContent?.modelTurn?.parts || []).filter((part) => typeof part.inlineData?.data === 'string').length;
            sendJson(client, { type: 'server', payload: parsed });
          } catch { fail('Gemini Live returned malformed data.'); }
        });
        gemini.on('error', (error) => {
          if (LIVE_DIAGNOSTICS) console.log(`[live] requestId=${requestId} Gemini websocket error=${error.message}`);
          if (setupAcknowledged) {
            sendJson(client, { type: 'state', state: 'reconnecting' });
            close();
          } else {
            fail('Gemini Live provider error.');
          }
        });
        gemini.on('close', (code, reason) => {
          if (providerTimer) clearTimeout(providerTimer);
          providerTimer = undefined;
          if (LIVE_DIAGNOSTICS) console.log(`[live] requestId=${requestId} Gemini websocket closed code=${code} reason=${String(reason || '').slice(0, 240) || 'none'} setupAcknowledged=${setupAcknowledged}`);
          if (!closed) {
            if (setupAcknowledged) sendJson(client, { type: 'state', state: 'reconnecting' });
            else sendJson(client, { type: 'state', state: 'failed', error: 'Gemini Live setup did not complete.' });
            close();
          }
        });
        return;
      }
      if (!gemini || gemini.readyState !== WebSocket.OPEN) return;
      if (message.type === 'audio' && typeof message.data === 'string') {
        inputFrames += 1;
        inputBytes += Math.floor(message.data.length * 3 / 4);
        gemini.send(JSON.stringify({ realtimeInput: { audio: { data: message.data, mimeType: message.mimeType || 'audio/pcm;rate=16000' } } }));
      } else if (message.type === 'interrupt') {
        gemini.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
      } else if (message.type === 'stop') {
        close();
      }
    });
    client.on('close', close);
    client.on('error', close);
  });
}

module.exports = { attachLiveProxy, createGeminiSetup, validateLiveStartMessage, authorizeLiveStartMessage };
