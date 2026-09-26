import type { Memory } from '../types';
import {
  addMemory as baseAddMemory,
  archiveMemory as baseArchiveMemory,
  buildMemoryRecord,
  deduplicateMemoryRecords,
  deleteMemory as baseDeleteMemory,
  evaluateMemoryCandidate,
  extractMemoryCandidate,
  getRelevantMemories as baseGetRelevantMemories,
  mergeMemoryRecord,
  normalizeMemoryText,
  promoteMemoryCandidate,
  resolveMemoryCategory,
  resolveMemoryScope,
  supersedeMemory as baseSupersedeMemory,
  updateMemory as baseUpdateMemory,
} from '../memory/lifecycle';

export {
  buildMemoryRecord,
  deduplicateMemoryRecords,
  evaluateMemoryCandidate,
  extractMemoryCandidate,
  mergeMemoryRecord,
  normalizeMemoryText,
  promoteMemoryCandidate,
  resolveMemoryCategory,
  resolveMemoryScope,
};

export function getRelevantMemories(memories: Memory[], limit = 8, filter?: Parameters<typeof baseGetRelevantMemories>[2]): Memory[] {
  return baseGetRelevantMemories(memories, limit, filter);
}

export function addMemory(memories: Memory[], memory: Memory): Memory[] {
  return baseAddMemory(memories, memory);
}

export function updateMemory(memories: Memory[], id: string, update: Partial<Memory>): Memory[] {
  return baseUpdateMemory(memories, id, update);
}

export function archiveMemory(memories: Memory[], id: string): Memory[] {
  return baseArchiveMemory(memories, id);
}

export function deleteMemory(memories: Memory[], id: string): Memory[] {
  return baseDeleteMemory(memories, id);
}

export function supersedeMemory(memories: Memory[], id: string, replacement: Memory): Memory[] {
  return baseSupersedeMemory(memories, id, replacement);
}
