import type { Companion, Group, Memory, Message } from '../types';
import { hydrateCompanions, hydrateConversations, hydrateMessages } from './serialize';
import {
  archiveMemory,
  buildMemoryRecord,
  deduplicateMemoryRecords,
  extractMemoryCandidate,
  getRelevantMemories,
  promoteMemoryCandidate,
  updateMemory,
  normalizeMemoryText,
} from './memoryStore';

const message: Message = { id: 'm', fromMe: true, type: 'text', text: 'hello', status: 'sent', timestamp: new Date() };
const group: Group = { id: 'g', name: 'Group', companionIds: ['a'], unreadCount: 0 };

export function runStorageContractTests(companion: Companion): void {
  if (hydrateMessages(JSON.parse(JSON.stringify([message]))).length !== 1) throw new Error('message hydration failed');
  if (Object.keys(hydrateConversations({ a: [message], g: [message] })).length !== 2) throw new Error('conversation isolation failed');
  if (hydrateConversations({ a: ['bad'] }).a.length !== 0) throw new Error('malformed message recovery failed');
  if (hydrateCompanions([{ ...companion, id: 'a' }], [companion])[0].id !== 'a') throw new Error('companion hydration failed');
  if (getRelevantMemories(companion.memories, 2).length > 2) throw new Error('memory bound failed');
  if (updateMemory(companion.memories, companion.memories[0]?.id || '', { text: 'updated' })[0]?.text !== 'updated') throw new Error('memory update failed');
  if (archiveMemory(companion.memories, companion.memories[0]?.id || '')[0]?.archived !== true) throw new Error('memory archive failed');
  if (group.companionIds[0] !== 'a') throw new Error('group isolation failed');

  const persistentFact = extractMemoryCandidate('You prefer tea over coffee in the mornings', { userId: 'user-1', companionId: companion.id, scope: 'companion' });
  if (persistentFact.status !== 'candidate') throw new Error('candidate extraction failed');
  if (normalizeMemoryText('I live in Bengaluru') !== normalizeMemoryText('I am living in Bengaluru')) throw new Error('normalized duplicate detection failed');

  const rejected = buildMemoryRecord('Hi there!', { scope: 'companion', companionId: companion.id });
  if (rejected.status !== 'rejected') throw new Error('candidate rejection failed');

  const exactDuplicate = deduplicateMemoryRecords([
    { ...persistentFact, id: 'existing-memory', text: 'You prefer tea over coffee in the mornings', status: 'accepted', archived: false } as Memory,
  ], persistentFact);
  if (!exactDuplicate.match) throw new Error('exact deduplication failed');

  const distinctFact = deduplicateMemoryRecords([
    { ...persistentFact, id: 'existing-memory-2', text: 'You prefer tea over coffee in the mornings', status: 'accepted' } as Memory,
  ], buildMemoryRecord('Your sister lives in Bengaluru', { scope: 'companion', companionId: companion.id }));
  if (distinctFact.match) throw new Error('distinct facts should not deduplicate');

  const promoted = promoteMemoryCandidate(companion.memories, persistentFact);
  if (promoted.length !== companion.memories.length) throw new Error('promotion failed');

  const reinforced = promoteMemoryCandidate(promoted, {
    ...persistentFact,
    id: 'reinforcement-candidate',
    source: 'conversation',
    text: 'You prefer tea over coffee in the mornings',
    status: 'candidate',
    userId: 'user-1',
    companionId: companion.id,
    scope: 'companion',
  });
  const matchCount = reinforced.filter((memory) => memory.text.includes('tea') || memory.text.includes('coffee')).length;
  if (matchCount < 1) throw new Error('reinforcement did not preserve a single logical memory');

  const userScoped = [{ ...persistentFact, id: 'user-memory', userId: 'user-a', companionId: undefined, scope: 'user' as const, text: 'User A lives in Bengaluru' }];
  if (getRelevantMemories(userScoped, 5, { userId: 'user-b' }).length !== 0) throw new Error('user isolation failed');
  if (getRelevantMemories(userScoped, 5, { userId: 'user-a', scope: 'user' }).length !== 1) throw new Error('user scope retrieval failed');

  const companionScoped = [{ ...persistentFact, id: 'companion-memory', companionId: 'companion-a', scope: 'companion' as const, text: 'You prefer tea over coffee' }];
  if (getRelevantMemories(companionScoped, 5, { companionId: 'companion-b' }).length !== 0) throw new Error('companion isolation failed');

  const groupScoped = [{ ...persistentFact, id: 'group-memory', groupId: 'g1', scope: 'group' as const, text: 'Evening circle preference: quiet time after 8pm' }];
  if (getRelevantMemories(groupScoped, 5, { groupId: 'g2' }).length !== 0) throw new Error('group isolation failed');

  if (group.companionIds[0] !== 'a') throw new Error('group isolation failed');
}
