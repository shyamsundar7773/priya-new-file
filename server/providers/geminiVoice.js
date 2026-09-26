const { sanitizedProviderError, providerTimeout } = require('./reliability');

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const diagnosticsEnabled = process.env.NODE_ENV !== 'production';

function logStt(requestId, fields) {
  if (diagnosticsEnabled) console.log(`[voice-stt] requestId=${requestId} ${fields}`);
}

function geminiError(status, code, message, endpoint, operation) {
  const error = sanitizedProviderError(Object.assign(new Error(message || 'Gemini voice provider request failed.'), {
    status,
    code,
  }), 'Gemini voice provider request failed.');
  error.upstreamStatus = status;
  error.upstreamCode = code;
  error.upstreamEndpoint = endpoint;
  error.operation = operation;
  return error;
}

async function geminiRequest(apiKey, path, body, operation) {
  const endpoint = `${GEMINI_API_BASE}${path}`;
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
      signal: providerTimeout(60_000),
    });
  } catch (cause) {
    const error = sanitizedProviderError(cause, 'Gemini voice provider request failed.');
    error.upstreamEndpoint = endpoint;
    error.operation = operation;
    throw error;
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const providerCode = data?.error?.status === 'RESOURCE_EXHAUSTED' || response.status === 429
      ? 'RATE_LIMIT'
      : response.status === 401 || response.status === 403
        ? 'INVALID_CREDENTIALS'
        : response.status === 400
          ? 'INVALID_REQUEST'
          : 'UNAVAILABLE';
    throw geminiError(response.status, providerCode, data?.error?.message, endpoint, operation);
  }
  return data;
}

async function uploadGeminiFile({ apiKey, audio, mimeType, requestId }) {
  const endpoint = 'https://generativelanguage.googleapis.com/upload/v1beta/files';
  logStt(requestId, `operation=upload_start endpoint=${endpoint} mimeType=${mimeType} decodedBytes=${audio.length}`);
  let startResponse;
  try {
    startResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
        'X-Goog-Upload-Protocol': 'resumable',
        'X-Goog-Upload-Command': 'start',
        'X-Goog-Upload-Header-Content-Length': String(audio.length),
        'X-Goog-Upload-Header-Content-Type': mimeType,
      },
      body: JSON.stringify({ file: { display_name: 'priya-voice-message' } }),
      signal: providerTimeout(60_000),
    });
  } catch (cause) {
    const error = sanitizedProviderError(cause, 'Gemini voice provider request failed.');
    error.upstreamEndpoint = endpoint;
    error.operation = 'upload_start';
    logStt(requestId, `operation=upload_start status=unknown success=false upstreamCode=${error.code}`);
    throw error;
  }
  if (!startResponse.ok) {
    const data = await startResponse.json().catch(() => null);
    const providerCode = startResponse.status === 429 ? 'RATE_LIMIT' : startResponse.status === 401 || startResponse.status === 403 ? 'INVALID_CREDENTIALS' : 'INVALID_REQUEST';
    logStt(requestId, `operation=upload_start status=${startResponse.status} success=false upstreamStatus=${startResponse.status} upstreamCode=${providerCode}`);
    throw geminiError(startResponse.status, providerCode, data?.error?.message, endpoint, 'upload_start');
  }
  logStt(requestId, `operation=upload_start status=${startResponse.status} success=true`);
  const uploadUrl = startResponse.headers.get('x-goog-upload-url');
  if (!uploadUrl) {
    logStt(requestId, 'operation=upload_start status=502 success=false upstreamCode=MALFORMED_RESPONSE');
    throw geminiError(502, 'MALFORMED_RESPONSE', 'Gemini Files API did not return an upload URL.', endpoint, 'upload_start');
  }

  let uploadResponse;
  try {
    uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Length': String(audio.length),
        'X-Goog-Upload-Offset': '0',
        'X-Goog-Upload-Command': 'upload, finalize',
      },
      body: audio,
      signal: providerTimeout(60_000),
    });
  } catch (cause) {
    const error = sanitizedProviderError(cause, 'Gemini voice provider request failed.');
    error.upstreamEndpoint = uploadUrl;
    error.operation = 'upload_finalize';
    logStt(requestId, `operation=upload_finalize status=unknown success=false upstreamCode=${error.code}`);
    throw error;
  }
  const fileData = await uploadResponse.json().catch(() => null);
  if (!uploadResponse.ok) {
    const providerCode = uploadResponse.status === 429 ? 'RATE_LIMIT' : uploadResponse.status === 401 || uploadResponse.status === 403 ? 'INVALID_CREDENTIALS' : uploadResponse.status === 400 ? 'INVALID_REQUEST' : 'UNAVAILABLE';
    logStt(requestId, `operation=upload_finalize status=${uploadResponse.status} success=false upstreamStatus=${uploadResponse.status} upstreamCode=${providerCode}`);
    throw geminiError(uploadResponse.status, providerCode, fileData?.error?.message, uploadUrl, 'upload_finalize');
  }
  logStt(requestId, `operation=upload_finalize status=${uploadResponse.status} success=true`);
  const file = fileData?.file;
  logStt(requestId, `operation=uploaded_file fileNamePresent=${Boolean(file?.name)} fileUriPresent=${Boolean(file?.uri)} mimeType=${mimeType}`);
  if (!file?.uri || !file?.name) throw geminiError(502, 'MALFORMED_RESPONSE', 'Gemini Files API returned incomplete file metadata.', uploadUrl, 'uploaded_file');
  return { uri: file.uri, name: file.name };
}

async function deleteGeminiFile(apiKey, name, requestId) {
  if (!name) return;
  let success = false;
  try {
    const response = await fetch(`${GEMINI_API_BASE}/${name}`, {
      method: 'DELETE',
      headers: { 'x-goog-api-key': apiKey },
      signal: providerTimeout(30_000),
    });
    success = response.ok;
  } catch {
    success = false;
  }
  logStt(requestId, `operation=cleanup attempted=true success=${success}`);
}

function interactionText(data) {
  if (typeof data?.output_text === 'string' && data.output_text.trim()) return data.output_text.trim();
  const steps = Array.isArray(data?.steps) ? data.steps : [];
  const stepText = steps
    .filter((step) => step?.type === 'model_output')
    .flatMap((step) => Array.isArray(step.content) ? step.content : [])
    .filter((content) => content?.type === 'text' && typeof content.text === 'string')
    .map((content) => content.text.trim())
    .filter(Boolean)
    .join(' ')
    .trim();
  if (stepText) return stepText;
  const outputs = Array.isArray(data?.outputs) ? data.outputs : [];
  return outputs
    .filter((output) => output?.type === 'text' && typeof output.text === 'string')
    .map((output) => output.text)
    .join('')
    .trim();
}

function responseStructure(data) {
  const stringFields = [];
  const structuralFields = [];
  const pending = [{ value: data, path: '$', depth: 0 }];
  let visited = 0;
  while (pending.length && visited < 10_000) {
    const { value, path, depth } = pending.pop();
    visited += 1;
    if (typeof value === 'string') {
      stringFields.push({ path, length: value.length });
    } else if (Array.isArray(value)) {
      structuralFields.push({ path, type: 'array', length: value.length });
      if (depth < 20) value.forEach((item, index) => pending.push({ value: item, path: `${path}[${index}]`, depth: depth + 1 }));
    } else if (value && typeof value === 'object') {
      const keys = Object.keys(value);
      structuralFields.push({ path, type: 'object', keys });
      if (depth < 20) {
        for (const key of keys) pending.push({ value: value[key], path: `${path}.${key}`, depth: depth + 1 });
      }
    }
  }
  return {
    topLevelKeys: data && typeof data === 'object' && !Array.isArray(data) ? Object.keys(data) : [],
    outputText: {
      present: typeof data?.output_text === 'string',
      length: typeof data?.output_text === 'string' ? data.output_text.length : null,
    },
    outputs: {
      present: Object.hasOwn(data || {}, 'outputs'),
      type: Array.isArray(data?.outputs) ? 'array' : typeof data?.outputs,
      length: Array.isArray(data?.outputs) ? data.outputs.length : null,
      itemTypes: Array.isArray(data?.outputs) ? data.outputs.map((item) => item?.type).filter((type) => typeof type === 'string') : [],
    },
    status: {
      present: Object.hasOwn(data || {}, 'status'),
      type: typeof data?.status,
      value: typeof data?.status === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(data.status) ? data.status : undefined,
    },
    usagePresent: Object.hasOwn(data || {}, 'usage'),
    totalOutputTokens: Number.isFinite(data?.usage?.total_output_tokens) ? data.usage.total_output_tokens : null,
    steps: {
      present: Object.hasOwn(data || {}, 'steps'),
      type: Array.isArray(data?.steps) ? 'array' : typeof data?.steps,
      length: Array.isArray(data?.steps) ? data.steps.length : null,
      itemTypes: Array.isArray(data?.steps) ? data.steps.map((step) => step?.type).filter((type) => typeof type === 'string') : [],
      contentKinds: Array.isArray(data?.steps) ? data.steps.flatMap((step) => Array.isArray(step?.content) ? step.content.map((content) => content?.type).filter((type) => typeof type === 'string') : []) : [],
    },
    model: typeof data?.model === 'string' ? data.model : undefined,
    version: typeof data?.version === 'string' ? data.version : undefined,
    structuralFields,
    stringFields,
    traversalTruncated: pending.length > 0,
  };
}

async function transcribeWithGemini({ apiKey, model, audioBase64, mimeType, requestId = 'unknown' }) {
  if (!apiKey) throw Object.assign(new Error('Gemini speech-to-text is not configured.'), { code: 'STT_UNAVAILABLE' });
  const audio = Buffer.from(audioBase64, 'base64');
  let uploadedFile;
  try {
    uploadedFile = await uploadGeminiFile({ apiKey, audio, mimeType, requestId });
    logStt(requestId, `operation=interactions model=${model} mimeType=${mimeType}`);
    let data;
    try {
      data = await geminiRequest(apiKey, '/interactions', {
      model,
      input: [{
        type: 'audio',
        uri: uploadedFile.uri,
        mime_type: mimeType,
      }],
      generation_config: {
        transcription_config: { mode: 'verbatim' },
      },
      store: false,
      }, 'interactions');
      logStt(requestId, 'operation=interactions status=200 success=true');
      logStt(requestId, `operation=response_structure status=200 structure=${JSON.stringify(responseStructure(data))}`);
    } catch (error) {
      logStt(requestId, `operation=interactions status=${error.upstreamStatus || 'unknown'} success=false upstreamStatus=${error.upstreamStatus || 'unknown'} upstreamCode=${error.upstreamCode || error.code || 'unknown'}`);
      throw error;
    }
    const text = interactionText(data);
    logStt(requestId, `operation=response_parse outputTextPresent=${typeof data?.output_text === 'string'} outputsPresent=${Array.isArray(data?.outputs)} transcriptLength=${text.length}`);
    if (!text) {
      const error = sanitizedProviderError(Object.assign(new Error(), { code: 'MALFORMED_RESPONSE' }), 'Gemini returned no transcription.');
      error.operation = 'response_parse';
      throw error;
    }
    return { text, provider: 'gemini', model };
  } finally {
    await deleteGeminiFile(apiKey, uploadedFile?.name, requestId);
  }
}

function pcmToWav(pcm, sampleRate = 24_000, channels = 1, bitsPerSample = 16) {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * bitsPerSample / 8;
  const blockAlign = channels * bitsPerSample / 8;
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function findAudioData(data) {
  if (typeof data?.output_audio?.data === 'string') return data.output_audio.data;
  const steps = Array.isArray(data?.steps) ? data.steps : [];
  for (const step of steps) {
    for (const content of Array.isArray(step.content) ? step.content : []) {
      if (typeof content?.data === 'string' && (content.type === 'audio' || content.mime_type?.startsWith('audio/'))) return content.data;
    }
  }
  return undefined;
}

async function synthesizeWithGemini({ apiKey, model, voice, text }) {
  if (!apiKey) throw Object.assign(new Error('Gemini text-to-speech is not configured.'), { code: 'TTS_UNAVAILABLE' });
  const data = await geminiRequest(apiKey, '/interactions', {
    model,
    input: [{
      type: 'user_input',
      content: [{
        type: 'text',
        text,
        annotations: [{ type: 'speech_metadata', style: 'warm, caring, conversational' }],
      }],
    }],
    response_format: { type: 'audio' },
    generation_config: { speech_config: [{ voice }] },
  });
  const audioData = findAudioData(data);
  if (!audioData) throw sanitizedProviderError(Object.assign(new Error(), { code: 'MALFORMED_RESPONSE' }), 'Gemini returned no audio.');
  const pcm = Buffer.from(audioData, 'base64');
  if (!pcm.length) throw sanitizedProviderError(Object.assign(new Error(), { code: 'MALFORMED_RESPONSE' }), 'Gemini returned empty audio.');
  return {
    audioBase64: pcmToWav(pcm).toString('base64'),
    mimeType: 'audio/wav',
    provider: 'gemini',
    model,
    voice,
  };
}

module.exports = { transcribeWithGemini, synthesizeWithGemini, pcmToWav, findAudioData, geminiRequest, interactionText, responseStructure };
