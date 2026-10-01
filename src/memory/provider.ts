import type { Companion, Memory } from '../types';
import { addMemory, archiveMemory, promoteMemoryCandidate, updateMemory } from '../memory/lifecycle';
import { selectRelevantMemories } from './relevance';

export interface MemoryQuery {
  companionId: string;
  userId?: string;
  query: string;
  groupId?: string;
}

export interface MemoryProvider {
  retrieveRelevant(memories: Memory[], query: MemoryQuery): Memory[];
  add(memories: Memory[], memory: Memory): Memory[];
  promote(memories: Memory[], candidate: Memory): Memory[];
  update(memories: Memory[], id: string, update: Partial<Memory>): Memory[];
  archive(memories: Memory[], id: string): Memory[];
}

export class LocalMemoryProvider implements MemoryProvider {
  retrieveRelevant(memories: Memory[], query: MemoryQuery): Memory[] {
    if (query.groupId) return [];
    return selectRelevantMemories(memories, query.query, query.companionId, query.userId);
  }

  add(memories: Memory[], memory: Memory): Memory[] {
    return addMemory(memories, memory);
  }

  promote(memories: Memory[], candidate: Memory): Memory[] {
    return promoteMemoryCandidate(memories, candidate);
  }

  update(memories: Memory[], id: string, update: Partial<Memory>): Memory[] {
    return updateMemory(memories, id, update);
  }

  archive(memories: Memory[], id: string): Memory[] {
    return archiveMemory(memories, id);
  }
}

export const localMemoryProvider: MemoryProvider = new LocalMemoryProvider();

export function memoriesForCompanion(
  companion: Companion,
  query: MemoryQuery,
  provider: MemoryProvider = localMemoryProvider,
): Memory[] {
  return provider.retrieveRelevant(companion.memories, query);
}
