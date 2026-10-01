import type { Memory } from '../types';

const MAX_MEMORIES = 8;
const STOP_WORDS = new Set(['a', 'an', 'and', 'are', 'for', 'from', 'has', 'have', 'how', 'in', 'is', 'it', 'me', 'my', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'was', 'what', 'when', 'with', 'you', 'your']);

function tokens(value: string): Set<string> {
  return new Set(value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((word) => word.length > 2 && !STOP_WORDS.has(word)));
}

function memoryMatches(memory: Memory, companionId: string, userId: string | undefined): boolean {
  if (memory.archived || memory.deleted || memory.status === 'archived' || memory.status === 'deleted' || memory.status === 'superseded') return false;
  if (memory.companionId && memory.companionId !== companionId) return false;
  if (memory.userId && userId && memory.userId !== userId) return false;
  return memory.scope === undefined || memory.scope === 'companion' || memory.scope === 'user';
}

export function selectRelevantMemories(memories: Memory[], currentMessage: string, companionId: string, userId?: string, limit = MAX_MEMORIES): Memory[] {
  const query = tokens(currentMessage);
  return memories
    .filter((memory) => memoryMatches(memory, companionId, userId))
    .map((memory) => {
      const memoryTokens = tokens(memory.text || memory.content || memory.fact || '');
      const overlap = [...query].filter((token) => memoryTokens.has(token)).length;
      const importance = memory.importance ?? 0;
      const confidence = memory.confidence ?? 0;
      const recency = Date.parse(memory.updatedAt || memory.createdAt || memory.savedAt || '') || 0;
      return { memory, score: overlap * 4 + importance * 2 + confidence + (overlap > 0 ? 1 : 0), overlap, recency };
    })
    .filter(({ overlap, score }) => overlap > 0 || score >= 2.6)
    .sort((left, right) => right.score - left.score || right.recency - left.recency)
    .slice(0, Math.max(0, limit))
    .map(({ memory }) => memory);
}
