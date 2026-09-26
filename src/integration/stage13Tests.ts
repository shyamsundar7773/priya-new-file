import { buildAIRequest } from '../ai/context';
import { buildCompanionAIContext } from '../ai/attachmentContext';
import { COMPANIONS } from '../data';
import { buildMemoryRecord, promoteMemoryCandidate, supersedeMemory } from '../storage/memoryStore';
import { applyRelationshipSignal, createRelationshipState } from '../relationship/engine';
import { buildLiveSystemInstruction } from '../voice/liveContext';
import type { Companion, Message } from '../types';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Stage 13 continuity contract failed: ${message}`);
}

function message(id: string, fromMe: boolean, text: string, timestamp: string): Message {
  return { id, fromMe, type: 'text', text, status: 'delivered', timestamp: new Date(timestamp) };
}

export function runStage13ContinuityContractTests(): void {
  const priya = COMPANIONS[0];
  const latha: Companion = COMPANIONS[1] || { ...priya, id: 'latha', name: 'Latha', tagline: 'A reflective companion' };
  const userId = 'stage13-user';

  const preference = buildMemoryRecord('The user prefers tea in the morning', {
    userId,
    companionId: priya.id,
    scope: 'companion',
  });
  const priyaMemory = promoteMemoryCandidate([], preference)[0];
  const relationship = applyRelationshipSignal(
    createRelationshipState(userId, priya.id),
    userId,
    priya.id,
    {
      id: 'conversation-1',
      type: 'conversation_completed',
      meaningful: true,
      occurredAt: '2026-09-25T00:00:00.000Z',
    },
  );
  const priyaState: Companion = {
    ...priya,
    memories: [priyaMemory],
    relationshipState: relationship,
    proactive: {
      ...priya.proactive,
      enabled: true,
      schedules: [{
        id: 'stage13-schedule',
        userId,
        companionId: priya.id,
        label: 'Morning check-in',
        datetime: '2026-09-25T08:00:00.000Z',
        channel: 'chat',
        message: 'Ask about the morning routine',
        status: 'scheduled',
      }],
    },
  };

  const history = [
    message('old', true, 'We talked about something unrelated.', '2026-09-24T00:00:00.000Z'),
    message('recent-1', true, 'I have an early meeting tomorrow.', '2026-09-25T00:01:00.000Z'),
    message('recent-2', false, 'I will remember that.', '2026-09-25T00:02:00.000Z'),
  ];
  const context = buildCompanionAIContext({
    companion: priyaState,
    history,
    userMessage: 'What should I drink this morning?',
    userId,
  });
  assert(context.companion.id === priya.id && context.companion.name === priya.name, 'identity is canonical and companion-specific');
  assert(context.companion.identity === priya.tagline, 'identity tagline reaches context');
  assert(context.memories.length === 1 && context.memories[0].text.includes('tea'), 'message-dependent relevant memory is selected');
  assert(context.shortTerm.map((item) => item.id).join(',') === 'old,recent-1,recent-2', 'recent conversation ordering is deterministic');
  assert(context.relationship?.stage === 'familiar', 'relationship summary reaches context');
  assert((context.relationship?.milestones.length || 0) > 0 && (context.relationship?.milestones.length || 0) <= 3, 'relationship summary contains bounded milestones');
  assert(context.proactive.length === 1 && context.proactive[0].includes('Morning check-in'), 'bounded proactive context reaches context');
  assert(context.shortTerm.length <= 12 && context.memories.length <= 8 && context.proactive.length <= 2, 'all continuity context is bounded');

  const request = buildAIRequest(priyaState, history, 'What should I drink this morning?', 'online', 'chat', undefined, [], [], userId);
  assert(request.attachedContext?.companion.id === priya.id, 'text path consumes canonical companion context');
  assert(request.attachedContext?.user.id === userId, 'user identity is attached without unrelated account state');
  assert(request.relationshipContext?.events.length === 0, 'raw relationship events are excluded from provider request');

  const liveInstruction = buildLiveSystemInstruction({
    companion: {
      id: priyaState.id,
      name: priyaState.name,
      personality: priyaState.personality,
      language: priyaState.language,
      aiConfig: priyaState.aiConfig,
    },
    memoryContext: context.memories.map((item) => item.text),
    relationshipContext: context.relationship && {
      stage: context.relationship.stage,
      familiarity: context.relationship.familiarity,
      trust: context.relationship.trust,
      closeness: context.relationship.closeness,
    },
    proactiveContext: context.proactive,
    recentConversation: context.shortTerm,
  });
  assert(liveInstruction.includes(priya.name) && liveInstruction.includes('tea'), 'Live boundary consumes matching identity and memory');
  assert(!liveInstruction.includes('conversation-1'), 'Live boundary does not receive raw relationship event IDs');

  const lathaContext = buildCompanionAIContext({
    companion: { ...latha, memories: [buildMemoryRecord('The user enjoys old Tamil songs', { userId, companionId: latha.id, scope: 'companion' })] },
    history: [message('latha-history', true, 'I listened to music.', '2026-09-25T00:03:00.000Z')],
    userMessage: 'What should I drink this morning?',
    userId,
  });
  assert(lathaContext.companion.id === latha.id, 'second companion identity remains isolated');
  assert(lathaContext.memories.every((item) => !item.text.includes('tea')), 'companion A memory is excluded from companion B');
  assert(lathaContext.shortTerm.every((item) => item.id !== 'recent-1'), 'conversation history is companion-specific');

  const replacement = buildMemoryRecord('The user prefers coffee in the morning', {
    userId,
    companionId: priya.id,
    scope: 'companion',
  });
  const superseded = supersedeMemory([priyaMemory], priyaMemory.id, replacement);
  const afterSupersession = buildCompanionAIContext({
    companion: { ...priyaState, memories: superseded },
    history: [],
    userMessage: 'What should I drink this morning?',
    userId,
  });
  assert(afterSupersession.memories.some((item) => item.text.includes('coffee')), 'explicit supersession makes replacement retrievable');
  assert(!afterSupersession.memories.some((item) => item.text.includes('tea')), 'superseded stale fact is excluded');

  const groupContext = buildCompanionAIContext({
    companion: priyaState,
    history,
    userMessage: 'tea',
    userId,
    mode: 'group',
    groupId: 'group-1',
    groupMessages: [message('group-message', true, 'Group planning', '2026-09-25T00:04:00.000Z')],
  });
  assert(groupContext.memories.length === 0 && !groupContext.relationship && groupContext.proactive.length === 0, 'group mode excludes private continuity context');
  assert(groupContext.shortTerm[0]?.id === 'group-message', 'group mode uses group history only');
}
