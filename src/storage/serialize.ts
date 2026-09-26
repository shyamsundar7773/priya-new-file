import type { Companion, Group, Message, RelationshipState } from '../types';
import { createRelationshipState } from '../relationship/engine';
import { normalizeAttachment } from '../attachments/model';

export function serializeMessages(messages: Message[]): Message[] {
  return messages.map((message) => ({ ...message, timestamp: new Date(message.timestamp) }));
}

export function hydrateMessages(messages: unknown): Message[] {
  if (!Array.isArray(messages)) return [];
  const validMessages = messages.filter((message): message is Message => {
    if (!message || typeof message !== 'object') return false;
    const item = message as Partial<Message>;
    return typeof item.id === 'string' && typeof item.fromMe === 'boolean' && typeof item.type === 'string' && typeof item.status === 'string';
  }).map((message) => ({
    ...message,
    timestamp: new Date(message.timestamp),
    attachments: Array.isArray(message.attachments)
      ? message.attachments.map(normalizeAttachment).filter((attachment): attachment is NonNullable<ReturnType<typeof normalizeAttachment>> => Boolean(attachment))
      : undefined,
  }));
  const unique = new Map<string, Message>();
  validMessages.forEach((message) => unique.set(message.id, message));
  return [...unique.values()];
}

export function hydrateConversations(value: unknown): Record<string, Message[]> {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(Object.entries(value).map(([id, messages]) => [
    id,
    hydrateMessages(messages).sort((left, right) => left.timestamp.getTime() - right.timestamp.getTime()),
  ]));
}

export function hydrateRelationshipState(value: unknown, userId: string, companionId: string): RelationshipState | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const item = value as Partial<RelationshipState>;
  if (item.userId !== userId || item.companionId !== companionId) return undefined;
  const fallback = createRelationshipState(userId, companionId);
  return {
    ...fallback,
    ...item,
    userId,
    companionId,
    familiarity: typeof item.familiarity === 'number' ? Math.max(0, Math.min(100, item.familiarity)) : 0,
    trust: typeof item.trust === 'number' ? Math.max(0, Math.min(100, item.trust)) : 0,
    closeness: typeof item.closeness === 'number' ? Math.max(0, Math.min(100, item.closeness)) : 0,
    interactionCount: typeof item.interactionCount === 'number' ? Math.max(0, item.interactionCount) : 0,
    conversationCount: typeof item.conversationCount === 'number' ? Math.max(0, item.conversationCount) : 0,
    events: Array.isArray(item.events) ? item.events.filter((event) => Boolean(event && typeof event === 'object' && typeof event.id === 'string')) : [],
    milestones: Array.isArray(item.milestones) ? item.milestones.filter((milestone) => Boolean(milestone && typeof milestone === 'object' && typeof milestone.id === 'string')) : [],
  };
}

export function hydrateCompanions(value: unknown, fallback: Companion[], userId?: string): Companion[] {
  if (!Array.isArray(value)) return fallback;
  const fallbackById = new Map(fallback.map((companion) => [companion.id, companion]));
  return value.filter((item): item is Companion => {
    if (!item || typeof item !== 'object') return false;
    const companion = item as Partial<Companion>;
    return typeof companion.id === 'string' && typeof companion.name === 'string' && typeof companion.personality === 'string' && typeof companion.language === 'string';
  }).map((companion) => ({
    ...(fallbackById.get(companion.id) || {}),
    ...companion,
    memories: Array.isArray(companion.memories) ? companion.memories : [],
    relationship: Array.isArray(companion.relationship) ? companion.relationship : [],
    relationshipState: userId ? hydrateRelationshipState(companion.relationshipState, userId, companion.id) : undefined,
    proactive: companion.proactive ? {
      ...companion.proactive,
      events: Array.isArray(companion.proactive.events) ? companion.proactive.events : [],
      candidates: Array.isArray(companion.proactive.candidates) ? companion.proactive.candidates : [],
      history: Array.isArray(companion.proactive.history) ? companion.proactive.history : [],
      schedules: Array.isArray(companion.proactive.schedules) ? companion.proactive.schedules : [],
    } : fallbackById.get(companion.id)?.proactive || {
      enabled: false, smartCheckins: false, quietHoursStart: '22:00', quietHoursEnd: '07:00', frequency: 'low', channels: { chat: true, voice: false, call: false }, schedules: [], events: [],
    },
  } as Companion));
}

export function hydrateGroups(value: unknown, fallback: Group[]): Group[] {
  if (!Array.isArray(value)) return fallback;
  return value.filter((item): item is Group => Boolean(item && typeof item === 'object' && typeof (item as Group).id === 'string' && typeof (item as Group).name === 'string' && Array.isArray((item as Group).companionIds))).map((group) => ({
    ...group,
    companionIds: [...new Set(group.companionIds)],
    conversationId: group.conversationId || `conversation-${group.id}`,
  }));
}
