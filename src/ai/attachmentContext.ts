import type { Companion, Memory, Message, ProactiveConfig, RelationshipState } from '../types';
import { toAttachmentContext, type Attachment } from '../attachments/model';

const MAX_MEMORIES = 8;
const MAX_HISTORY_MESSAGES = 12;
const MAX_HISTORY_CHARS = 6000;
const STOP_WORDS = new Set(['a', 'an', 'and', 'are', 'for', 'from', 'has', 'have', 'how', 'in', 'is', 'it', 'me', 'my', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'was', 'what', 'when', 'with', 'you', 'your']);

export interface CompanionAIContext {
  companion: {
    id: string;
    name: string;
    identity: string;
    personality: string;
    tone: { warmth: number; playfulness: number; depth: number; formality: number };
    language: { primary: string; secondary?: string; codeSwitching: boolean };
  };
  user: { id?: string };
  memories: Memory[];
  relationship?: { stage: RelationshipState['stage']; familiarity: number; trust: number; closeness: number; milestones: string[] };
  shortTerm: Message[];
  proactive: string[];
  attachments: ReturnType<typeof toAttachmentContext>;
  mode: 'chat' | 'voice' | 'call' | 'group';
  groupId?: string;
}

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

export function boundShortTermContext(history: Message[], limit = MAX_HISTORY_MESSAGES): Message[] {
  const selected: Message[] = [];
  let chars = 0;
  for (const message of history.slice(-limit).reverse()) {
    const text = message.text?.trim();
    if (!text) continue;
    if (chars + text.length > MAX_HISTORY_CHARS && selected.length > 0) break;
    selected.unshift(message);
    chars += text.length;
  }
  return selected;
}

function proactiveSignals(config: ProactiveConfig | undefined, now = Date.now()): string[] {
  if (!config?.enabled) return [];
  return (config.schedules || [])
    .filter((schedule) => (schedule.status || 'scheduled') === 'scheduled' && (!schedule.updatedAt || Date.parse(schedule.updatedAt) <= now))
    .slice(0, 2)
    .map((schedule) => schedule.message ? `Scheduled moment: ${schedule.label} — ${schedule.message}` : `Scheduled moment: ${schedule.label}`);
}

export function buildCompanionAIContext(options: {
  companion: Companion;
  history: Message[];
  userMessage: string;
  userId?: string;
  mode?: 'chat' | 'voice' | 'call' | 'group';
  groupId?: string;
  groupMessages?: Message[];
  attachments?: Attachment[];
}): CompanionAIContext {
  const { companion, history, userMessage, userId, mode = 'chat', groupId } = options;
  const config = companion.aiConfig;
  const languageParts = companion.language.split('&').map((value) => value.trim());
  const tone = config?.personality || { warmth: 75, playfulness: 55, depth: 80, formality: 25 };
  const language = config?.language || { primary: languageParts[0] || 'English', secondary: languageParts[1], codeSwitching: languageParts.length > 1 };
  const groupMode = mode === 'group';
  return {
    companion: {
      id: companion.id,
      name: companion.name,
      identity: companion.tagline,
      personality: companion.personality,
      tone,
      language,
    },
    user: { id: userId },
    memories: groupMode ? [] : selectRelevantMemories(companion.memories, userMessage, companion.id, userId),
    relationship: groupMode || !companion.relationshipState || companion.relationshipState.archived ? undefined : {
      stage: companion.relationshipState.stage,
      familiarity: companion.relationshipState.familiarity,
      trust: companion.relationshipState.trust,
      closeness: companion.relationshipState.closeness,
      milestones: companion.relationshipState.milestones.slice(-3).map((milestone) => milestone.title),
    },
    shortTerm: groupMode ? boundShortTermContext(options.groupMessages || []) : boundShortTermContext(history),
    proactive: groupMode ? [] : proactiveSignals(companion.proactive),
    attachments: groupMode ? [] : toAttachmentContext(options.attachments || [], userId, companion.id),
    mode,
    groupId,
  };
}
