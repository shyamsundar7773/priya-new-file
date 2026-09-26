import type {
  RelationshipEvent,
  RelationshipEventType,
  RelationshipMilestone,
  RelationshipStage,
  RelationshipState,
} from '../types';

export interface RelationshipSignal {
  id: string;
  type: RelationshipEventType;
  occurredAt?: string;
  sourceMessageId?: string;
  provenance?: string;
  meaningful?: boolean;
}

const MAX_EVENTS = 64;
const MAX_MILESTONES = 16;

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function stageFor(state: Pick<RelationshipState, 'familiarity' | 'trust' | 'closeness' | 'conversationCount'>): RelationshipStage {
  const score = (state.familiarity + state.trust + state.closeness) / 3;
  if (state.conversationCount === 0) return 'new';
  if (score >= 78 && state.conversationCount >= 12) return 'deep';
  if (score >= 58 && state.conversationCount >= 7) return 'close';
  if (score >= 35 && state.conversationCount >= 3) return 'comfortable';
  return 'familiar';
}

export function createRelationshipState(userId: string, companionId: string, now = new Date().toISOString()): RelationshipState {
  return {
    userId,
    companionId,
    stage: 'new',
    familiarity: 0,
    trust: 0,
    closeness: 0,
    interactionCount: 0,
    conversationCount: 0,
    createdAt: now,
    updatedAt: now,
    archived: false,
    events: [],
    milestones: [],
  };
}

function milestone(
  state: RelationshipState,
  type: RelationshipMilestone['type'],
  title: string,
  event: RelationshipEvent,
): RelationshipMilestone {
  return { id: `milestone:${type}`, type, title, achievedAt: event.occurredAt, eventId: event.id };
}

function addMilestone(state: RelationshipState, item: RelationshipMilestone): RelationshipState {
  if (state.milestones.some((existing) => existing.id === item.id)) return state;
  return { ...state, milestones: [...state.milestones, item].slice(-MAX_MILESTONES) };
}

export function applyRelationshipSignal(
  current: RelationshipState | undefined,
  userId: string,
  companionId: string,
  signal: RelationshipSignal,
): RelationshipState {
  const initial = current && current.userId === userId && current.companionId === companionId
    ? current
    : createRelationshipState(userId, companionId, signal.occurredAt);
  if (initial.archived || initial.events.some((event) => event.id === signal.id)) return initial;

  const occurredAt = signal.occurredAt ?? new Date().toISOString();
  const event: RelationshipEvent = {
    id: signal.id,
    userId,
    companionId,
    type: signal.type,
    occurredAt,
    sourceMessageId: signal.sourceMessageId,
    provenance: signal.provenance,
  };

  const meaningful = signal.meaningful ?? signal.type !== 'conversation_completed';
  const next: RelationshipState = {
    ...initial,
    interactionCount: initial.interactionCount + 1,
    conversationCount: initial.conversationCount + (signal.type === 'conversation_completed' ? 1 : 0),
    firstInteractionAt: initial.firstInteractionAt ?? occurredAt,
    lastInteractionAt: occurredAt,
    updatedAt: occurredAt,
    events: [...initial.events, event].slice(-MAX_EVENTS),
    familiarity: clamp(initial.familiarity + (signal.type === 'conversation_completed' ? (meaningful ? 4 : 1) : 2)),
    trust: clamp(initial.trust + (signal.type === 'memory_reinforced' ? 3 : signal.type === 'call_completed' ? 2 : meaningful ? 1 : 0)),
    closeness: clamp(initial.closeness + (signal.type === 'memory_reinforced' ? 2 : signal.type === 'call_completed' ? 2 : meaningful ? 1 : 0)),
    archived: false,
  };

  let withMilestones = next;
  if (signal.type === 'conversation_completed' && !initial.milestones.some((item) => item.id === 'milestone:first_conversation')) {
    withMilestones = addMilestone(withMilestones, milestone(withMilestones, 'first_conversation', 'First conversation', event));
  }
  if (signal.type === 'return_visit' && !initial.milestones.some((item) => item.id === 'milestone:returning_interaction')) {
    withMilestones = addMilestone(withMilestones, milestone(withMilestones, 'returning_interaction', 'Returned for another conversation', event));
  }
  if (signal.type === 'memory_reinforced' && !initial.milestones.some((item) => item.id === 'milestone:meaningful_memory')) {
    withMilestones = addMilestone(withMilestones, milestone(withMilestones, 'meaningful_memory', 'A meaningful memory was reinforced', event));
  }

  const nextStage = stageFor(withMilestones);
  if (nextStage !== initial.stage) {
    withMilestones = {
      ...withMilestones,
      stage: nextStage,
      milestones: withMilestones.milestones.some((item) => item.id === `milestone:stage:${nextStage}`)
        ? withMilestones.milestones
        : [...withMilestones.milestones, milestone(withMilestones, 'milestone_reached', `Relationship became ${nextStage}`, event)].map((item) =>
          item.id === 'milestone:milestone_reached' ? { ...item, id: `milestone:stage:${nextStage}` } : item,
        ).slice(-MAX_MILESTONES),
    };
  }

  return withMilestones;
}

export function archiveRelationship(state: RelationshipState): RelationshipState {
  return { ...state, archived: true, updatedAt: new Date().toISOString() };
}

export function resetRelationship(userId: string, companionId: string, now = new Date().toISOString()): RelationshipState {
  return createRelationshipState(userId, companionId, now);
}

export function relationshipContext(state: RelationshipState | undefined): RelationshipState | undefined {
  if (!state || state.archived) return undefined;
  return {
    ...state,
    events: [],
    milestones: state.milestones.slice(-3),
  };
}
