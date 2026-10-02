const { ZepClient } = require('@getzep/zep-cloud');

const DEFAULT_TIMEOUT_SECONDS = 8;
const DEFAULT_MEMORY_LIMIT = 5;

function buildZepThreadId(userId, conversationId) {
  const normalizedUserId = String(userId ?? '').trim();
  const normalizedConversationId = String(conversationId ?? '').trim();
  if (!normalizedUserId && !normalizedConversationId) return 'default';
  if (!normalizedUserId) return `conversation:${normalizedConversationId}`;
  if (!normalizedConversationId) return `user:${normalizedUserId}`;
  return `user:${normalizedUserId}:conversation:${normalizedConversationId}`;
}

function buildZepSessionId(userId, conversationId) {
  return buildZepThreadId(userId, conversationId);
}

function sanitizeForLog(value) {
  return typeof value === 'string' && value.trim() ? value.slice(0, 64) : 'unknown';
}

function normalizeZepMemoryText(value) {
  if (typeof value !== 'string') return '';
  const cleaned = value.trim();
  return cleaned.length > 0 ? cleaned : '';
}

function dedupeList(list) {
  const seen = new Set();
  const output = [];
  for (const entry of list) {
    const normalized = typeof entry === 'string' ? entry.trim() : '';
    if (!normalized) continue;
    const fingerprint = normalized.toLowerCase();
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    output.push(normalized);
  }
  return output;
}

function normalizeZepContext(response, limit = DEFAULT_MEMORY_LIMIT) {
  const memoryEntries = [];
  if (!response || typeof response !== 'object') return memoryEntries;

  const directContext = normalizeZepMemoryText(response?.context || '');
  if (directContext) memoryEntries.push(directContext);

  const factRows = Array.isArray(response.relevantFacts) ? response.relevantFacts : [];
  for (const fact of factRows) {
    const text = normalizeZepMemoryText(fact?.fact || fact?.content || fact?.text || fact?.summary || '');
    if (text) memoryEntries.push(text);
  }

  const recentMessages = Array.isArray(response.messages) ? response.messages : [];
  for (const message of recentMessages) {
    const text = normalizeZepMemoryText(message?.content || '');
    if (text) memoryEntries.push(text);
  }

  const summaryText = normalizeZepMemoryText(response?.summary?.content || response?.summary?.text || response?.summary?.summary || '');
  if (summaryText) memoryEntries.push(summaryText);

  const deduped = dedupeList(memoryEntries).slice(0, Math.max(0, Number(limit) || DEFAULT_MEMORY_LIMIT));
  return deduped.map((text, index) => ({
    id: `zep-context-${index + 1}`,
    text,
    source: 'conversation',
    scope: 'user',
    status: 'accepted',
    confidence: 0.8,
    importance: 0.7,
    relevance: 0.8,
  }));
}

function createZepMemoryProvider(config = {}, clientFactory) {
  const providerName = String(config.memoryProvider || 'local').toLowerCase();
  const apiKey = typeof config.zepApiKey === 'string' ? config.zepApiKey.trim() : '';
  const apiUrl = typeof config.zepApiUrl === 'string' && config.zepApiUrl.trim() ? config.zepApiUrl.trim() : 'https://api.getzep.com/api/v2';
  const enabled = providerName === 'zep' && Boolean(apiKey);
  let clientPromise;

  const sharedClientState = {
    apiKey: null,
    promise: null,
  };

  async function getClient() {
    if (!enabled) return null;
    if (clientFactory) {
      if (!clientPromise) clientPromise = Promise.resolve(clientFactory({ apiKey, baseUrl: apiUrl }));
      return clientPromise;
    }
    if (sharedClientState.apiKey !== `${apiKey}|${apiUrl}`) {
      sharedClientState.apiKey = `${apiKey}|${apiUrl}`;
      sharedClientState.promise = Promise.resolve(new ZepClient({ apiKey, baseUrl: apiUrl }));
    }
    return sharedClientState.promise;
  }

  async function ensureUser(userId, profile = {}) {
    const normalizedUserId = String(userId ?? '').trim();
    if (!normalizedUserId || !enabled) return null;
    const zepClient = await getClient();
    try {
      await zepClient.user.get(normalizedUserId, { timeoutInSeconds: DEFAULT_TIMEOUT_SECONDS });
      return { userId: normalizedUserId, exists: true };
    } catch (error) {
      const statusCode = error?.statusCode || error?.status || 0;
      if (statusCode !== 404 && !/not found/i.test(error?.message || '')) {
        throw error;
      }
      return zepClient.user.add({
        userId: normalizedUserId,
        email: profile.email,
        firstName: profile.firstName,
        lastName: profile.lastName,
        metadata: {
          source: 'priya-companion',
          ...(profile.metadata || {}),
        },
      }, { timeoutInSeconds: DEFAULT_TIMEOUT_SECONDS });
    }
  }

  async function ensureSession(userId, conversationId, metadata = {}) {
    const normalizedUserId = String(userId ?? '').trim();
    const normalizedConversationId = String(conversationId ?? '').trim();
    if (!normalizedUserId || !normalizedConversationId || !enabled) return null;
    const zepClient = await getClient();
    const threadId = buildZepThreadId(normalizedUserId, normalizedConversationId);
    try {
      await zepClient.thread.get(threadId, { limit: 1 }, { timeoutInSeconds: DEFAULT_TIMEOUT_SECONDS });
      return { sessionId: threadId, threadId, exists: true };
    } catch (error) {
      const statusCode = error?.statusCode || error?.status || 0;
      if (statusCode !== 404 && !/not found/i.test(error?.message || '')) {
        throw error;
      }
      return zepClient.thread.create({
        threadId,
        userId: normalizedUserId,
      }, { timeoutInSeconds: DEFAULT_TIMEOUT_SECONDS }).then((created) => ({
        sessionId: threadId,
        threadId,
        exists: false,
        created,
        metadata,
      }));
    }
  }

  async function appendTurn({ userId, conversationId, role, content, timestamp, metadata = {} }) {
    if (!enabled) return { enabled: false, ok: false, reason: 'disabled' };
    const normalizedUserId = String(userId ?? '').trim();
    const normalizedConversationId = String(conversationId ?? '').trim();
    const normalizedRole = role === 'assistant' ? 'assistant' : 'user';
    const normalizedContent = String(content ?? '').trim();
    if (!normalizedUserId || !normalizedConversationId || !normalizedContent) {
      return { enabled: true, ok: false, reason: 'missing-user-or-conversation-or-content' };
    }

    try {
      const zepClient = await getClient();
      const threadId = buildZepThreadId(normalizedUserId, normalizedConversationId);
      const result = await zepClient.thread.addMessages(threadId, {
        messages: [{
          role: normalizedRole,
          content: normalizedContent,
          createdAt: timestamp || new Date().toISOString(),
          metadata: {
            app: 'priya-companion',
            userId: normalizedUserId,
            conversationId: normalizedConversationId,
            ...metadata,
          },
        }],
      }, { timeoutInSeconds: DEFAULT_TIMEOUT_SECONDS });
      return { enabled: true, ok: true, sessionId: threadId, threadId, result };
    } catch (error) {
      console.warn(`[zep] memory_write_failed userId=${sanitizeForLog(userId)} conversationId=${sanitizeForLog(conversationId)} role=${normalizedRole} errorName=${error?.name || 'UnknownError'} message=${error?.message || 'unknown'}`);
      return { enabled: true, ok: false, error: error?.message || 'Zep memory write failed.' };
    }
  }

  async function getRelevantContext({ userId, conversationId, limit = DEFAULT_MEMORY_LIMIT }) {
    if (!enabled) return [];
    const normalizedUserId = String(userId ?? '').trim();
    const normalizedConversationId = String(conversationId ?? '').trim();
    if (!normalizedUserId || !normalizedConversationId) return [];

    try {
      const zepClient = await getClient();
      const threadId = buildZepThreadId(normalizedUserId, normalizedConversationId);
      const response = await zepClient.thread.getUserContext(threadId, {}, { timeoutInSeconds: DEFAULT_TIMEOUT_SECONDS });
      return normalizeZepContext(response, limit);
    } catch (error) {
      console.warn(`[zep] memory_read_failed userId=${sanitizeForLog(userId)} conversationId=${sanitizeForLog(conversationId)} errorName=${error?.name || 'UnknownError'} message=${error?.message || 'unknown'}`);
      return [];
    }
  }

  async function enrichRequestContext(request, options = {}) {
    if (!enabled || !request) return request;
    const userId = options.userId || request?.authenticatedUserId || request?.interaction?.userId || request?.userId;
    const conversationId = options.conversationId || request?.interaction?.conversationId || request?.conversationId || request?.companion?.id || request?.companionId;
    if (!userId || !conversationId) return request;

    try {
      const memories = await getRelevantContext({ userId, conversationId, limit: 5 });
      const existing = Array.isArray(request?.attachedContext?.memories) ? request.attachedContext.memories : Array.isArray(request?.memoryContext) ? request.memoryContext : [];
      return {
        ...request,
        attachedContext: {
          ...(request.attachedContext || {}),
          memories: [...existing, ...memories],
        },
        memoryContext: [...existing, ...memories],
      };
    } catch (error) {
      console.warn(`[zep] request_context_enrichment_failed userId=${sanitizeForLog(userId)} conversationId=${sanitizeForLog(conversationId)} errorName=${error?.name || 'UnknownError'} message=${error?.message || 'unknown'}`);
      return request;
    }
  }

  return {
    enabled,
    isEnabled: () => enabled,
    getClient,
    ensureUser,
    ensureSession,
    appendTurn,
    getRelevantContext,
    enrichRequestContext,
    buildSessionId: buildZepSessionId,
    buildThreadId: buildZepThreadId,
  };
}

module.exports = {
  createZepMemoryProvider,
  buildZepSessionId,
  buildZepThreadId,
  normalizeZepContext,
};
