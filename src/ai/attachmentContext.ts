import type { Companion, Memory, Message, ProactiveConfig, RelationshipState } from '../types';
import { toAttachmentContext, type Attachment } from '../attachments/model';
import { localMemoryProvider } from '../memory/provider';

const MAX_HISTORY_MESSAGES = 12;
const MAX_HISTORY_CHARS = 6000;

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

export { selectRelevantMemories } from '../memory/relevance';

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
    memories: groupMode ? [] : localMemoryProvider.retrieveRelevant(companion.memories, {
      companionId: companion.id,
      userId,
      query: userMessage,
    }),
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
