const assert = require('node:assert/strict');
const { transcribeAudio } = require('./providers/stt');
const { requestTextToSpeech } = require('./providers/tts');
const { interactionText, responseStructure } = require('./providers/geminiVoice');

function jsonResponse(body, ok = true, status = 200) {
  return { ok, status, json: async () => body, text: async () => JSON.stringify(body), arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer, headers: { get: (name) => name.toLowerCase() === 'x-goog-upload-url' ? 'https://upload.test/file' : null } };
}

async function main() {
  const originalFetch = global.fetch;
  const requests = [];
  let forceInteractionFailure = false;
  global.fetch = async (url, init) => {
    requests.push({ url, init });
    if (url.includes('/upload/v1beta/files')) return jsonResponse({}, true, 200);
    if (url === 'https://upload.test/file') return jsonResponse({ file: { name: 'files/test', uri: 'https://file.test/audio' } });
    if (url.includes('/files/test')) throw new Error('cleanup unavailable');
    if (url.includes('/interactions')) {
      if (forceInteractionFailure) return jsonResponse({ error: { code: 400, status: 'INVALID_ARGUMENT', message: 'bad audio' } }, false, 400);
      return init.body.includes('"response_format":{"type":"audio"}')
        ? jsonResponse({ output_audio: { data: Buffer.from([1, 2, 3]).toString('base64') } })
        : jsonResponse({
          status: 'completed',
          steps: [{
            type: 'model_output',
            content: [{ type: 'text', text: 'TEST TRANSCRIPT' }],
          }],
          model: 'gemini-3.5-transcribe',
        });
    }
    return jsonResponse({ steps: [{ type: 'model_output', content: [{ type: 'audio', data: Buffer.from([1, 2, 3]).toString('base64'), mime_type: 'audio/pcm' }] }] });
  };
  try {
    const transcription = await transcribeAudio({
      apiKey: 'test-key',
      model: 'gemini-3.5-transcribe',
      audioBase64: Buffer.from('audio').toString('base64'),
      mimeType: 'audio/m4a',
      requestId: 'voice-stt-contract',
    });
    assert.equal(transcription.text, 'TEST TRANSCRIPT');
    assert.equal(transcription.provider, 'gemini');
    assert.equal(requests[0].url.includes('/upload/v1beta/files'), true);
    const sttInteraction = requests.find(({ url, init }) => url.includes('/interactions') && !init.body.includes('"response_format"'));
    assert.ok(sttInteraction, 'STT Interactions request should be sent');
    const sttPayload = JSON.parse(sttInteraction.init.body);
    assert.deepEqual(sttPayload.generation_config, {
      transcription_config: { mode: 'verbatim' },
    });
    assert.equal(Object.hasOwn(sttPayload, 'transcription_config'), false);
    assert.equal(sttPayload.store, false);
    assert.deepEqual(sttPayload.input, [{
      type: 'audio',
      uri: 'https://file.test/audio',
      mime_type: 'audio/m4a',
    }]);
    const observedResponse = { output_text: 'I prefer tea' };
    const structure = responseStructure(observedResponse);
    assert.deepEqual(structure.topLevelKeys, ['output_text']);
    assert.equal(structure.outputText.present, true);
    assert.equal(structure.outputText.length, 'I prefer tea'.length);
    assert.deepEqual(structure.stringFields, [{ path: '$.output_text', length: 'I prefer tea'.length }]);
    assert.equal(JSON.stringify(structure).includes('I prefer tea'), false);

    assert.equal(interactionText({
      status: 'completed',
      steps: [{
        type: 'model_output',
        content: [{ type: 'text', text: 'TEST TRANSCRIPT' }],
      }],
      model: 'gemini-3.5-transcribe',
    }), 'TEST TRANSCRIPT');
    assert.equal(interactionText({
      steps: [
        { type: 'user_input', content: [{ type: 'text', text: 'ignore user input' }] },
        { type: 'model_output', content: [{ type: 'thought', text: 'ignore thoughts' }, { type: 'audio', data: 'ignore audio' }] },
        { type: 'tool_call', content: [{ type: 'text', text: 'ignore tool output' }] },
        { type: 'model_output', content: [{ type: 'text', text: 'Hello' }, { type: 'text', text: 'there' }] },
      ],
    }), 'Hello there');
    assert.equal(interactionText({
      output_text: 'preferred',
      steps: [{ type: 'model_output', content: [{ type: 'text', text: 'lower priority' }] }],
    }), 'preferred');
    assert.equal(interactionText({
      outputs: [{ type: 'text', text: 'legacy transcript' }],
    }), 'legacy transcript');

    forceInteractionFailure = true;
    await assert.rejects(
      () => transcribeAudio({ apiKey: 'test-key', model: 'gemini-3.5-transcribe', audioBase64: Buffer.from('audio').toString('base64'), mimeType: 'audio/m4a', requestId: 'voice-stt-error-contract' }),
      (error) => error.operation === 'interactions' && error.upstreamStatus === 400 && error.upstreamCode === 'INVALID_REQUEST',
    );
    forceInteractionFailure = false;

    const speech = await requestTextToSpeech({
      apiKey: 'test-key',
      model: 'gemini-3.8-flash-lite-tts',
      voice: 'Kore',
      text: 'Hello',
    });
    assert.equal(speech.provider, 'gemini');
    assert.equal(speech.mimeType, 'audio/wav');
    assert.ok(Buffer.from(speech.audioBase64, 'base64').subarray(0, 4).toString() === 'RIFF');

    await assert.rejects(() => transcribeAudio({
      apiKey: 'test-key',
      model: 'gemini-3.5-transcribe',
      audioBase64: Buffer.from('audio').toString('base64'),
      mimeType: 'application/octet-stream',
    }), /Unsupported audio format/);
    console.log('Individual voice-message provider contracts passed.');
  } finally {
    global.fetch = originalFetch;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
