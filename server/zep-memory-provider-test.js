const assert = require('node:assert/strict');
const { createZepMemoryProvider, buildZepSessionId, normalizeZepContext } = require('./memory/zepProvider');

(async function run() {
  const mockClient = {
    user: {
      get: async (userId) => {
        if (userId === 'user-a') {
          throw Object.assign(new Error('not found'), { statusCode: 404 });
        }
        return { id: userId };
      },
      add: async (request) => ({ ...request, created: true }),
    },
    thread: {
      get: async (threadId) => {
        if (threadId === 'user:user-a:conversation:conv-1') {
          throw Object.assign(new Error('not found'), { statusCode: 404 });
        }
        return { id: threadId, messages: [] };
      },
      create: async (request) => ({ ...request, created: true }),
      addMessages: async (threadId, request) => ({ threadId, request, ok: true }),
      getUserContext: async (threadId) => ({
        context: 'User prefers tea in the morning. They like calm conversations.',
        threadId,
      }),
    },
  };

  const provider = createZepMemoryProvider({ memoryProvider: 'zep', zepApiKey: 'test-key' }, () => mockClient);
  assert.equal(provider.isEnabled(), true, 'Zep memory provider is enabled when configured');
  assert.equal(buildZepSessionId('user-a', 'conv-1'), 'user:user-a:conversation:conv-1', 'same user/conversation maps to the same deterministic session');
  assert.notEqual(buildZepSessionId('user-a', 'conv-1'), buildZepSessionId('user-b', 'conv-1'), 'different users do not share the same session');

  const context = normalizeZepContext({
    context: 'Prefers tea. Likes calm conversations.',
    summary: { content: 'Prefers tea.' },
    relevantFacts: [{ fact: 'Loves tea.' }],
    messages: [{ content: 'I like tea in the morning.' }],
  }, 5);
  assert.ok(context.some((item) => /tea/i.test(item.text)), 'context includes the semantic memory text');

  const ensured = await provider.ensureUser('user-a', { email: 'user-a@example.com', firstName: 'User', lastName: 'A' });
  assert.equal(ensured.userId, 'user-a', 'Zep user mapping preserves the application user ID');

  const session = await provider.ensureSession('user-a', 'conv-1', { companionId: 'priya' });
  assert.equal(session.sessionId, 'user:user-a:conversation:conv-1', 'session mapping is deterministic and namespaced by user and conversation');

  const relevant = await provider.getRelevantContext({ userId: 'user-a', conversationId: 'conv-1', limit: 4 });
  assert.ok(relevant.length >= 1, 'Zep context retrieval returns at least one relevant memory');

  const writing = await provider.appendTurn({
    userId: 'user-a',
    conversationId: 'conv-1',
    role: 'assistant',
    content: 'Nice to hear from you.',
    metadata: { modality: 'text' },
  });
  assert.equal(writing.ok, true, 'appendTurn succeeds when the Zep backend accepts the message');

  const failingClient = {
    user: mockClient.user,
    thread: {
      ...mockClient.thread,
      addMessages: async () => {
        throw new Error('rate limited');
      },
    },
  };
  const failureProvider = createZepMemoryProvider({ memoryProvider: 'zep', zepApiKey: 'test-key' }, () => failingClient);
  const failedWrite = await failureProvider.appendTurn({
    userId: 'user-a',
    conversationId: 'conv-1',
    role: 'assistant',
    content: 'This should fail.',
    metadata: { modality: 'text' },
  });
  assert.equal(failedWrite.ok, false, 'appendTurn returns false when the backend fails but does not block the app');

  const disabled = createZepMemoryProvider({ memoryProvider: 'local', zepApiKey: '' });
  assert.equal(disabled.isEnabled(), false, 'Zep is disabled when not explicitly enabled');

  console.log('Zep memory provider tests passed.');
})();
