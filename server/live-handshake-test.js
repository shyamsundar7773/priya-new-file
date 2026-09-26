const assert = require('node:assert/strict');
const WebSocket = require('ws');
const config = require('./config');
const { createGeminiSetup } = require('./liveProxy');

const endpoint = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
const timeoutMs = 15000;

if (!config.geminiApiKey) {
  throw new Error('GEMINI_API_KEY is missing from server configuration.');
}

const socket = new WebSocket(`${endpoint}?key=${encodeURIComponent(config.geminiApiKey)}`);
let settled = false;
let setupAcknowledged = false;
let minimalTextSent = false;
let responseObserved = false;
const timer = setTimeout(() => finish(new Error('Timed out waiting for Gemini setup acknowledgement.')), timeoutMs);

function finish(error) {
  if (settled) return;
  settled = true;
  clearTimeout(timer);
  if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close();
  if (error) {
    console.error(`Gemini Live handshake failed: ${error.message}`);
    process.exitCode = 1;
  } else {
    console.log(`Gemini Live handshake passed: model=${config.geminiLiveModel} acknowledgement=setupComplete minimalTextResponse=serverContent`);
  }
}

socket.on('open', () => {
  console.log(`Gemini Live provider WebSocket opened: model=${config.geminiLiveModel}`);
  socket.send(JSON.stringify(createGeminiSetup({
    systemInstruction: 'Handshake validation only. Do not generate a response.',
  }, config.geminiLiveModel)));
  console.log('Gemini Live setup message sent: type=setup');
});

socket.on('message', (payload) => {
  let parsed;
  try {
    parsed = JSON.parse(payload.toString());
  } catch {
    finish(new Error('Provider returned malformed JSON.'));
    return;
  }
  if (parsed.setupComplete) {
    setupAcknowledged = true;
    console.log('Gemini Live incoming message: type=setupComplete');
    if (!minimalTextSent) {
      socket.send(JSON.stringify({
        realtimeInput: {
          text: 'Reply with a brief hello for protocol validation.',
        },
      }));
      minimalTextSent = true;
      console.log('Gemini Live minimal text sent: type=realtimeInput');
    }
    return;
  }
  if (parsed.error) {
    const status = typeof parsed.error.status === 'string' ? parsed.error.status : 'UNKNOWN';
    const code = parsed.error.code ?? 'none';
    const message = typeof parsed.error.message === 'string' ? parsed.error.message : 'Gemini Live provider error.';
    finish(new Error(`provider error status=${status} code=${code} message=${message}`));
    return;
  }
  if (parsed.serverContent) {
    const keys = Object.keys(parsed.serverContent).sort().join(',');
    console.log(`Gemini Live incoming message: type=serverContent fields=${keys || 'none'}`);
    if (parsed.serverContent.modelTurn || parsed.serverContent.outputTranscription) {
      responseObserved = true;
    }
    if (setupAcknowledged && minimalTextSent && responseObserved) finish();
  }
});

socket.on('error', (error) => finish(new Error(`WebSocket error: ${error.message}`)));
socket.on('close', (code, reason) => {
  if (!settled) finish(new Error(`Provider closed before setup acknowledgement: code=${code} reason=${String(reason || '').slice(0, 240) || 'none'}`));
});
