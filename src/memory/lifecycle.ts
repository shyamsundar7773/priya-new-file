import type { Memory, MemoryScope, MemoryStatus } from '../types';

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'i', 'you', 'your', 'we', 'our', 'me', 'my', 'am', 'is', 'are', 'was', 'were',
  'be', 'been', 'being', 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'as', 'and', 'or', 'but',
  'if', 'then', 'than', 'from', 'into', 'out', 'up', 'down', 'over', 'under', 'about', 'after',
  'before', 'by', 'it', 'its', 'this', 'that', 'these', 'those', 'do', 'does', 'did', 'have',
  'has', 'had', 'not', 'no', 'yes', 'so', 'too', 'very', 'just', 'more', 'most', 'some', 'all',
  'can', 'could', 'would', 'should', 'will', 'also', 'through', 'because', 'while', 'when',
  'where', 'who', 'why', 'how', 'what', 'which', 'there', 'here', 'they', 'them', 'their', 'mine',
]);

const LOW_VALUE_PATTERNS = [
  /^hi$/i, /^hello$/i, /^hey$/i, /^good morning$/i, /^good night$/i, /^thanks?$/i,
  /^thank you$/i, /^how are you\??$/i, /^what's up\??$/i, /^what is up\??$/i,
  /^ok$/i, /^okay$/i, /^sure$/i, /^yes$/i, /^no$/i, /^maybe$/i,
];

const FACT_PATTERNS = [
  /prefer|favorite|favourite|love|hate|enjoy|dislike|always|never|live(s)? in|works? at|studies? at|family|sister|brother|mother|father|partner|project|gym|coffee|tea|meeting|anxious|wants?|plans?|remembers?|needs?/i,
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function stemWord(word: string): string {
  const normalized = word.toLowerCase();
  const irregular = {
    living: 'live',
    working: 'work',
    studying: 'study',
    planning: 'plan',
    reading: 'read',
    writing: 'write',
    traveling: 'travel',
    travelling: 'travel',
    meeting: 'meet',
    preferring: 'prefer',
    loving: 'love',
    hating: 'hate',
    eating: 'eat',
    drinking: 'drink',
    playing: 'play',
  } as Record<string, string>;

  if (irregular[normalized]) return irregular[normalized];
  return normalized.replace(/(ing|ed|es|s)$/i, '');
}

export function normalizeMemoryText(text: string): string {
  const cleaned = (text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return '';

  const words = cleaned
    .split(' ')
    .filter((word) => word.length > 0 && !STOP_WORDS.has(word))
    .map((word) => stemWord(word));

  return words.join(' ');
}

function computeSimilarity(left: string, right: string): number {
  const leftWords = normalizeMemoryText(left).split(' ').filter(Boolean);
  const rightWords = normalizeMemoryText(right).split(' ').filter(Boolean);

  if (!leftWords.length && !rightWords.length) return 1;
  if (!leftWords.length || !rightWords.length) return 0;

  const leftSet = new Set(leftWords);
  const rightSet = new Set(rightWords);
  const common = [...leftSet].filter((word) => rightSet.has(word)).length;
  const union = new Set([...leftSet, ...rightSet]).size;

  if (!union) return 1;

  const jaccard = common / union;
  const containsScore = leftWords.join(' ').includes(rightWords.join(' ')) || rightWords.join(' ').includes(leftWords.join(' ')) ? 1 : 0;
  return Math.max(jaccard, containsScore);
}

export function inferMemoryScope(scope?: MemoryScope | string): MemoryScope {
  if (scope === 'user' || scope === 'companion' || scope === 'relationship' || scope === 'group') return scope;
  return 'companion';
}

export function inferMemoryCategory(text: string, fallback = 'General'): string {
  const normalized = text.toLowerCase();
  if (/(prefer|coffee|tea|food|drink|meal|taste)/i.test(normalized)) return 'Preferences';
  if (/(family|sister|brother|mother|father|parent|partner|child|son|daughter|wife|husband)/i.test(normalized)) return 'Family';
  if (/(gym|workout|fitness|run|exercise|health)/i.test(normalized)) return 'Fitness';
  if (/(project|work|client|meeting|deadline|office|task|goal)/i.test(normalized)) return 'Work';
  if (/(anxious|stress|nervous|happy|sad|mood|emotion|feel)/i.test(normalized)) return 'Emotions';
  if (/(music|poem|book|read|travel|movie|hobby|art|guitar|painting)/i.test(normalized)) return 'Interests';
  if (/(live|lives|home|city|country|bengaluru|chennai|delhi|mumbai)/i.test(normalized)) return 'Location';
  return fallback;
}

export function evaluateMemoryCandidate(
  text: string,
  options: { scope?: MemoryScope | string; userId?: string; companionId?: string; groupId?: string; source?: Memory['source']; } = {},
): { confidence: number; importance: number; relevance: number; status: MemoryStatus; reason: string } {
  const value = String(text ?? '').trim();
  if (!value) {
    return { confidence: 0, importance: 0, relevance: 0, status: 'rejected', reason: 'empty-memory' };
  }

  const normalized = normalizeMemoryText(value);
  const isLowValue = LOW_VALUE_PATTERNS.some((pattern) => pattern.test(value));
  const hasFactSignal = FACT_PATTERNS.some((pattern) => pattern.test(value));

  let confidence = 0.45;
  if (value.length > 18) confidence += 0.18;
  if (value.length > 60) confidence -= 0.05;
  if (/\?/.test(value)) confidence -= 0.2;
  if (hasFactSignal) confidence += 0.18;
  if (/I\s|you\s|we\s|my\s|your\s/.test(value)) confidence += 0.08;
  if (isLowValue) confidence -= 0.35;
  if (/(today|now|just|later|yesterday|tomorrow|currently)/i.test(value)) confidence -= 0.1;
  confidence = clamp(confidence, 0, 1);

  let importance = 0.25;
  if (hasFactSignal) importance += 0.3;
  if (value.length > 20) importance += 0.15;
  if (/(prefer|favorite|love|hate|dislike|needs?|lives?|works?|studies?|plans?)/i.test(value)) importance += 0.2;
  if (isLowValue || value.length < 8) importance -= 0.3;
  importance = clamp(importance, 0, 1);

  const relevance = clamp(0.4 + Math.min(normalized.split(' ').filter(Boolean).length / 20, 0.45) + ((options.scope === 'user' || options.scope === 'group') ? 0.08 : 0), 0, 1);

  let status: MemoryStatus = 'candidate';
  const reason = isLowValue ? 'low-value-chatter' : hasFactSignal ? 'fact-like' : 'generic-detail';

  if (confidence < 0.45 || importance < 0.35 || isLowValue) {
    status = 'rejected';
  } else if (confidence >= 0.7 && importance >= 0.6) {
    status = 'accepted';
  }

  return { confidence, importance, relevance, status, reason };
}

export function buildMemoryRecord(
  text: string,
  options: {
    id?: string;
    userId?: string;
    companionId?: string;
    groupId?: string;
    scope?: MemoryScope | string;
    source?: Memory['source'];
    category?: string;
    status?: MemoryStatus;
    confidence?: number;
    importance?: number;
    relevance?: number;
    provenance?: Memory['provenance'];
  } = {},
): Memory {
  const scope = inferMemoryScope(options.scope);
  const evaluation = evaluateMemoryCandidate(text, { scope, userId: options.userId, companionId: options.companionId, groupId: options.groupId, source: options.source });
  const now = new Date().toISOString();
  const category = options.category ?? inferMemoryCategory(text);

  return {
    id: options.id ?? `memory-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    userId: options.userId,
    companionId: options.companionId,
    groupId: options.groupId,
    scope,
    type: 'fact',
    category,
    text: text.trim(),
    content: text.trim(),
    fact: text.trim(),
    source: options.source ?? 'conversation',
    status: options.status ?? evaluation.status,
    confidence: options.confidence ?? evaluation.confidence,
    importance: options.importance ?? evaluation.importance,
    relevance: options.relevance ?? evaluation.relevance,
    createdAt: now,
    updatedAt: now,
    savedAt: now,
    archived: false,
    deleted: false,
    lastAccessedAt: now,
    accessCount: 0,
    reinforcementCount: 0,
    provenance: options.provenance ?? { sourceText: text.trim() },
    isLowValue: evaluation.status === 'rejected',
    reason: evaluation.reason,
  };
}

export function extractMemoryCandidate(
  text: string,
  options: {
    id?: string;
    userId?: string;
    companionId?: string;
    groupId?: string;
    scope?: MemoryScope | string;
    source?: Memory['source'];
    category?: string;
    provenance?: Memory['provenance'];
  } = {},
): Memory {
  return buildMemoryRecord(text, { ...options, status: 'candidate' });
}

export function deduplicateMemoryRecords(existing: Memory[], candidate: Memory): { match: Memory | null; action: 'merge' | 'accept' | 'reject' } {
  const candidateText = candidate.text ?? candidate.content ?? '';
  if (!candidateText) return { match: null, action: 'reject' };

  for (const item of existing) {
    const existingText = item.text ?? item.content ?? '';
    if (!existingText) continue;

    const exact = normalizeMemoryText(existingText) === normalizeMemoryText(candidateText);
    const similarity = computeSimilarity(existingText, candidateText);
    const sameScope = (item.scope ?? 'companion') === (candidate.scope ?? 'companion');
    const sameCompanion = !item.companionId || !candidate.companionId || item.companionId === candidate.companionId;
    const sameGroup = !item.groupId || !candidate.groupId || item.groupId === candidate.groupId;
    const sameUser = !item.userId || !candidate.userId || item.userId === candidate.userId;

    if ((exact || similarity >= 0.8) && sameScope && sameCompanion && sameGroup && sameUser) {
      return { match: item, action: 'merge' };
    }
  }

  return { match: null, action: 'accept' };
}

export function mergeMemoryRecord(existing: Memory, candidate: Memory): Memory {
  const mergedText = existing.text.length >= candidate.text.length ? existing.text : candidate.text;
  const mergedConfidence = Math.max(existing.confidence ?? 0.5, candidate.confidence ?? 0.5);
  const mergedImportance = Math.max(existing.importance ?? 0.5, candidate.importance ?? 0.5);
  const mergedRelevance = Math.max(existing.relevance ?? 0.5, candidate.relevance ?? 0.5);

  return {
    ...existing,
    ...candidate,
    id: existing.id,
    text: mergedText,
    content: candidate.content ?? existing.content ?? mergedText,
    fact: candidate.fact ?? existing.fact ?? mergedText,
    category: candidate.category ?? existing.category ?? 'General',
    scope: existing.scope ?? candidate.scope ?? 'companion',
    userId: existing.userId ?? candidate.userId,
    companionId: existing.companionId ?? candidate.companionId,
    groupId: existing.groupId ?? candidate.groupId,
    source: candidate.source ?? existing.source,
    status: 'merged',
    confidence: mergedConfidence,
    importance: mergedImportance,
    relevance: mergedRelevance,
    updatedAt: new Date().toISOString(),
    savedAt: existing.savedAt ?? candidate.savedAt ?? new Date().toISOString(),
    archived: false,
    deleted: false,
    reinforcementCount: (existing.reinforcementCount ?? 0) + 1,
    provenance: {
      ...(existing.provenance ?? {}),
      ...(candidate.provenance ?? {}),
      sourceText: mergedText,
    },
    isLowValue: false,
  };
}

export function promoteMemoryCandidate(memories: Memory[], candidate: Memory): Memory[] {
  const evaluation = evaluateMemoryCandidate(candidate.text, {
    scope: candidate.scope,
    userId: candidate.userId,
    companionId: candidate.companionId,
    groupId: candidate.groupId,
    source: candidate.source,
  });

  if (evaluation.status === 'rejected') {
    return memories;
  }

  const nextCandidate: Memory = {
    ...candidate,
    status: 'accepted',
    confidence: evaluation.confidence,
    importance: evaluation.importance,
    relevance: evaluation.relevance,
  };

  const result = deduplicateMemoryRecords(memories, nextCandidate);
  if (result.match) {
    return memories.map((memory) => memory.id === result.match?.id ? mergeMemoryRecord(memory, nextCandidate) : memory);
  }

  const acceptedMemory: Memory = {
    ...nextCandidate,
    archived: false,
    deleted: false,
    updatedAt: new Date().toISOString(),
    savedAt: new Date().toISOString(),
    createdAt: candidate.createdAt ?? new Date().toISOString(),
    provenance: candidate.provenance ?? { sourceText: candidate.text },
    status: 'accepted',
  };
  return [...memories, acceptedMemory];
}

export type MemoryFilter = {
  scope?: MemoryScope | string;
  userId?: string;
  companionId?: string;
  groupId?: string;
  limit?: number;
};

export function getRelevantMemories(memories: Memory[], limit = 8, filter: MemoryFilter = {}): Memory[] {
  const resolvedLimit = typeof limit === 'number' && Number.isFinite(limit) ? Math.max(0, limit) : 8;

  return [...memories]
    .filter((memory) => !memory.archived && !memory.deleted)
    .filter((memory) => {
      if (filter.scope && (memory.scope ?? 'companion') !== inferMemoryScope(filter.scope)) return false;
      if (filter.userId && memory.userId && memory.userId !== filter.userId) return false;
      if (filter.companionId && memory.companionId && memory.companionId !== filter.companionId) return false;
      if (filter.groupId && memory.groupId && memory.groupId !== filter.groupId) return false;
      return true;
    })
    .sort((a, b) => {
      const left = (b.importance ?? 0) + (b.confidence ?? 0) + (b.relevance ?? 0);
      const right = (a.importance ?? 0) + (a.confidence ?? 0) + (a.relevance ?? 0);
      if (left !== right) return left - right;
      const aUpdated = a.updatedAt ?? a.createdAt ?? a.savedAt ?? new Date(0).toISOString();
      const bUpdated = b.updatedAt ?? b.createdAt ?? b.savedAt ?? new Date(0).toISOString();
      return bUpdated.localeCompare(aUpdated);
    })
    .slice(0, resolvedLimit);
}

export function addMemory(memories: Memory[], memory: Memory): Memory[] {
  const next: Memory = {
    ...memory,
    status: memory.status ?? 'accepted',
    source: memory.source ?? 'user',
    createdAt: memory.createdAt ?? new Date().toISOString(),
    updatedAt: memory.updatedAt ?? new Date().toISOString(),
    savedAt: memory.savedAt ?? new Date().toISOString(),
    archived: Boolean(memory.archived),
    deleted: Boolean(memory.deleted),
    accessCount: memory.accessCount ?? 0,
    reinforcementCount: memory.reinforcementCount ?? 0,
    scope: memory.scope ?? 'companion',
  };
  return [...memories, next];
}

export function updateMemory(memories: Memory[], id: string, update: Partial<Memory>): Memory[] {
  return memories.map((memory) => {
    if (memory.id !== id) return memory;
    const updated: Memory = {
      ...memory,
      ...update,
      updatedAt: new Date().toISOString(),
      savedAt: update.savedAt ?? memory.savedAt ?? new Date().toISOString(),
      archived: update.archived ?? memory.archived,
      deleted: update.deleted ?? memory.deleted,
      status: update.status ?? memory.status ?? 'accepted',
    };
    return updated;
  });
}

export function archiveMemory(memories: Memory[], id: string): Memory[] {
  return memories.map((memory) => {
    if (memory.id !== id) return memory;
    const archivedMemory: Memory = { ...memory, archived: true, status: 'archived', updatedAt: new Date().toISOString() };
    return archivedMemory;
  });
}

export function deleteMemory(memories: Memory[], id: string): Memory[] {
  return memories.map((memory) => {
    if (memory.id !== id) return memory;
    const deletedMemory: Memory = { ...memory, deleted: true, status: 'deleted', archived: true, updatedAt: new Date().toISOString() };
    return deletedMemory;
  });
}

export function supersedeMemory(memories: Memory[], id: string, replacement: Memory): Memory[] {
  const next: Memory[] = memories.map((memory) => memory.id === id ? { ...memory, status: 'superseded', archived: true, updatedAt: new Date().toISOString() } : memory);
  const acceptedReplacement: Memory = { ...replacement, status: 'accepted', scope: replacement.scope ?? 'companion' };
  return addMemory(next, acceptedReplacement);
}

export { inferMemoryScope as resolveMemoryScope };
export { inferMemoryCategory as resolveMemoryCategory };
