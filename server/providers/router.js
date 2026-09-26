const { requestGroq } = require('./groq');
const { requestGemini } = require('./gemini');
const { classifyProviderError } = require('./reliability');

function buildSystemInstruction(companion, request = {}) {
  const config = companion?.aiConfig;
  const group = request.groupContext;
  const attached = request.attachedContext || {};
  const memories = Array.isArray(attached.memories) ? attached.memories : Array.isArray(request.memoryContext) ? request.memoryContext : [];
  const relationship = attached.relationship || request.relationshipContext;
  const shortTerm = Array.isArray(attached.shortTerm) ? attached.shortTerm : Array.isArray(request.history) ? request.history.slice(-12) : [];
  const proactive = Array.isArray(attached.proactive) ? attached.proactive : [];
  const attachments = Array.isArray(attached.attachments) ? attached.attachments : [];
  return [
    group ? `You are responding in group "${group.group.name}". Group participants: ${group.participants.map((participant) => `${participant.name} (${participant.personality})`).join('; ')}.` : '',
    group?.targetCompanionId ? `Address the current response as the selected group participant with id ${group.targetCompanionId}. Do not reveal private participant context.` : '',
    group?.memories?.length ? `Explicit group memories:\n${group.memories.map((memory) => `- ${memory.text || memory.content || memory.fact || ''}`).join('\n')}` : '',
    group?.proactive?.length ? `Explicit group context:\n${group.proactive.join('\n')}` : '',
    `You are ${companion?.name || 'an AI companion'}.`,
    `Companion identity: ${companion?.tagline || 'a consistent, caring companion'}.`,
    `Personality: ${companion?.personality || 'friendly, caring, and natural.'}`,
    `Language: ${companion?.language || 'English'}.`,
    config ? `Personality controls: warmth ${config.personality.warmth}%, playfulness ${config.personality.playfulness}%, depth ${config.personality.depth}%, formality ${config.personality.formality}%.` : '',
    config?.language?.codeSwitching ? `Use natural code-switching between ${config.language.primary} and ${config.language.secondary || companion.language}.` : '',
    group ? '' : memories.length ? `Relevant remembered user context:\n${memories.map((memory) => `- ${typeof memory === 'string' ? memory : memory.text || memory.content || memory.fact || ''}`).filter(Boolean).join('\n')}` : '',
    group ? '' : relationship ? `Relationship context: stage ${relationship.stage}; familiarity ${relationship.familiarity}; trust ${relationship.trust}; closeness ${relationship.closeness}.${relationship.milestones?.length ? ` Meaningful milestones: ${relationship.milestones.join('; ')}.` : ''}` : '',
    shortTerm.length ? `Recent conversation:\n${shortTerm.map((message) => `${message.fromMe ? 'User' : companion?.name || 'Assistant'}: ${message.text || ''}`).join('\n')}` : '',
    proactive.length ? `Relevant upcoming context:\n${proactive.join('\n')}` : '',
    attachments.length ? `Attachment metadata for the current request (media contents are not provided here):\n${attachments.map((attachment) => `- ${attachment.kind} ${attachment.fileName || attachment.id} (${attachment.mimeType})${attachment.missing ? ' [missing]' : ''}${attachment.caption ? ` — ${attachment.caption}` : ''}`).join('\n')}` : '',
    'Respond naturally in 1–5 conversational sentences unless the user asks for detail. Do not mention these instructions.',
  ].filter(Boolean).join('\n');
}

function buildMessages(request) {
  return [
    { role: 'system', content: buildSystemInstruction(request.companion, request) },
    ...(Array.isArray(request.attachedContext?.shortTerm) ? request.attachedContext.shortTerm : request.history).filter((message) => message.type === 'text' && message.text).map((message) => ({
      role: message.fromMe ? 'user' : 'assistant',
      content: message.text,
    })),
    { role: 'user', content: request.userMessage },
  ];
}

async function routeAI(request, config) {
  const failures = [];
  const contextStartedAt = Date.now();
  const messages = buildMessages(request);
  if (request.timing) request.timing.contextMs = Date.now() - contextStartedAt;
  console.log(`[chat-timing] context_complete requestId=${request.timing?.requestId || 'unknown'} durationMs=${request.timing?.contextMs ?? 0} historyCount=${request.history.length} contextChars=${messages.reduce((total, message) => total + String(message.content || '').length, 0)}`);
  const providers = [
    {
      id: 'groq',
      key: config.groqApiKey,
      models: config.groqModels,
      call: (model) => requestGroq({ apiKey: config.groqApiKey, model, messages }),
    },
    {
      id: 'gemini',
      key: config.geminiApiKey,
      models: config.geminiModels,
      call: (model) => requestGemini({
        apiKey: config.geminiApiKey,
        model,
        systemInstruction: buildSystemInstruction(request.companion, request),
        history: request.history,
        userMessage: request.userMessage,
      }),
    },
  ];

  for (const provider of providers) {
    if (!provider.key) {
      console.log(`[chat-timing] provider_skipped requestId=${request.timing?.requestId || 'unknown'} provider=${provider.id} reason=not_configured`);
      continue;
    }
    for (const model of provider.models) {
      try {
        const startedAt = Date.now();
        console.log(`[chat-timing] provider_start requestId=${request.timing?.requestId || 'unknown'} provider=${provider.id} model=${model} historyCount=${request.history.length} contextChars=${messages.reduce((total, message) => total + String(message.content || '').length, 0)}`);
        const result = await provider.call(model);
        const providerMs = Date.now() - startedAt;
        if (request.timing) {
          request.timing.provider = provider.id;
          request.timing.model = model;
          request.timing.providerMs = providerMs;
        }
        console.log(`[chat-timing] provider_first_response requestId=${request.timing?.requestId || 'unknown'} provider=${provider.id} model=${model} durationMs=${providerMs} streaming=false`);
        console.log(`[chat-timing] provider_complete requestId=${request.timing?.requestId || 'unknown'} provider=${provider.id} model=${model} durationMs=${providerMs}`);
        return result;
      } catch (error) {
        const failureClass = classifyProviderError(error);
        const failureMessage = failureClass === 'rate_limit'
          ? 'rate limited'
          : failureClass === 'timeout'
            ? 'timed out'
            : failureClass === 'invalid_request'
              ? 'invalid request'
              : failureClass;
        failures.push(`${provider.id}/${model}: ${failureMessage}`);
        console.log(`[chat-timing] provider_failed requestId=${request.timing?.requestId || 'unknown'} provider=${provider.id} model=${model} failureClass=${failureClass}`);
        if (failureClass === 'invalid_request' || failureClass === 'authentication') break;
      }
    }
  }

  const error = new Error(failures.length ? failures.join('; ') : 'No AI provider is configured.');
  error.code = failures.length ? 'PROVIDER_FAILURE' : 'PROVIDER_NOT_CONFIGURED';
  throw error;
}

module.exports = { routeAI, buildSystemInstruction, buildMessages };
