import { SupabaseConversationArchive } from './supabaseArchive';
import { archiveRecordFromMessage } from './types';
import type { Message } from '../types';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Persistence contract failed: ${message}`);
}

function createArchiveClient(userId: string) {
  const rows = {
    conversations: new Map<string, Record<string, unknown>>(),
    messages: new Map<string, Record<string, unknown>>(),
  };

  const query = (table: 'conversations' | 'messages') => ({
    _filters: [] as [string, unknown][],
    select() { return this; },
    eq(field: string, value: unknown) {
      this._filters.push([field, value]);
      return this;
    },
    order(field: string, _direction: { ascending: boolean }) {
      const entries = [...rows[table].values()].filter((row) => {
        return this._filters.every(([filterField, expected]) => row[filterField] === expected);
      });
      entries.sort((left, right) => {
        const leftValue = String((left[field] ?? '') as string);
        const rightValue = String((right[field] ?? '') as string);
        return leftValue.localeCompare(rightValue);
      });
      return { data: entries, error: null };
    },
  });

  return {
    auth: {
      getUser: async () => ({ data: { user: { id: userId } }, error: null }),
    },
    from: (table: 'conversations' | 'messages') => ({
      upsert: async (record: Record<string, unknown>) => {
        if (table === 'messages') {
          const key = `${String(record.user_id)}:${String(record.id)}`;
          rows.messages.set(key, record);
        } else {
          const key = `${String(record.user_id)}:${String(record.id)}`;
          rows.conversations.set(key, record);
        }
        return { error: null };
      },
      select: () => query(table),
    }),
  };
}

export async function runPersistenceContractTests(): Promise<void> {
  const companionId = 'companion-1';
  const userA = 'user-a';
  const userB = 'user-b';

  const archiveA = new SupabaseConversationArchive(createArchiveClient(userA) as never);
  const archiveB = new SupabaseConversationArchive(createArchiveClient(userB) as never);

  const first = archiveRecordFromMessage({
    userId: userA,
    companionId,
    conversationId: companionId,
    message: {
      id: 'msg-1',
      fromMe: true,
      type: 'text',
      text: 'My favorite food is chicken biryani.',
      status: 'sent',
      timestamp: new Date('2026-10-02T10:00:00.000Z'),
    } as Message,
  });
  const second = archiveRecordFromMessage({
    userId: userA,
    companionId,
    conversationId: companionId,
    message: {
      id: 'msg-2',
      fromMe: false,
      type: 'text',
      text: 'I will remember that.',
      status: 'delivered',
      timestamp: new Date('2026-10-02T10:00:01.000Z'),
    } as Message,
  });

  await archiveA.appendMessage(first);
  await archiveA.appendMessage(second);
  await archiveA.appendMessage(first);

  const conversationHistory = await archiveA.loadConversationMessages(companionId, userA);
  assert(conversationHistory.length === 2, 'conversation history is preserved after duplicate archive writes');
  assert(conversationHistory[0].text === 'My favorite food is chicken biryani.', 'message order is deterministic');
  assert(conversationHistory[1].text === 'I will remember that.', 'assistant response is preserved');

  const allMessages = await archiveA.loadUserConversations(userA);
  assert(allMessages[companionId]?.length === 2, 'user hydration restores all canonical records');

  const otherUserHistory = await archiveB.loadUserConversations(userB);
  assert(!Object.keys(otherUserHistory).includes(companionId), 'different users cannot see another user\'s archived conversation');

  const unauthorizedListen = await archiveB.loadConversationMessages(companionId, userB);
  assert(unauthorizedListen.length === 0, 'different users cannot read the same conversation history');

  const userBMessage = archiveRecordFromMessage({
    userId: userB,
    companionId,
    conversationId: companionId,
    message: {
      id: 'msg-3',
      fromMe: true,
      type: 'text',
      text: 'This should not appear for user A.',
      status: 'sent',
      timestamp: new Date('2026-10-02T10:00:03.000Z'),
    } as Message,
  });
  await archiveB.appendMessage(userBMessage);
  const userAAfterB = await archiveA.loadUserConversations(userA);
  assert(userAAfterB[companionId]?.length === 2, 'user A history remains isolated from user B writes');

  const voiceMessage = archiveRecordFromMessage({
    userId: userA,
    companionId,
    conversationId: `voice-${companionId}`,
    message: {
      id: 'voice-msg-1',
      fromMe: true,
      type: 'voice',
      text: 'What movie did I tell you I like?',
      voiceDuration: 120,
      voiceTranscription: 'What movie did I tell you I like?',
      status: 'delivered',
      timestamp: new Date('2026-10-02T10:00:05.000Z'),
    } as Message,
  });
  await archiveA.appendMessage(voiceMessage);
  const voiceResult = await archiveA.loadConversationMessages(`voice-${companionId}`, userA);
  assert(voiceResult[0]?.type === 'voice' && voiceResult[0].voiceTranscription === 'What movie did I tell you I like?', 'voice-message archive metadata survives hydration');
}
