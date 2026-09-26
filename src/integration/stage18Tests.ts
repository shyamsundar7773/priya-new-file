import { COMPANIONS } from '../data';
import { buildAIRequest } from '../ai/context';
import { buildCompanionAIContext } from '../ai/attachmentContext';
import { buildGroupAIContext } from '../groups/context';
import { createAttachment, markAttachmentState, normalizeAttachment, toAttachmentContext } from '../attachments/model';
import { buildMemoryRecord, extractMemoryCandidate, promoteMemoryCandidate, getRelevantMemories } from '../memory/lifecycle';
import { applyRelationshipSignal, createRelationshipState, relationshipContext } from '../relationship/engine';
import { appendProactiveEvent, evaluateProactive, markProactiveDelivered } from '../proactive/engine';
import { hydrateCompanions, hydrateConversations, hydrateGroups } from '../storage/serialize';
import { userStorageKeys } from '../storage/keys';
import { createAssistantVoiceMessage, createVoiceUserMessage, retryVoiceOperation } from '../voice/messagePipeline';
import { buildLiveSystemInstruction } from '../voice/liveContext';
import type { Companion, Group, Message } from '../types';

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Stage 18 integration failed: ${message}`);
}

function fixtureCompanion(id: string, userId: string, name: string, personality: string): Companion {
  const source = COMPANIONS.find((item) => item.id === id) || COMPANIONS[0];
  return {
    ...source,
    id,
    name,
    personality,
    memories: [],
    relationship: [],
    relationshipState: createRelationshipState(userId, id, '2026-01-01T00:00:00.000Z'),
    proactive: {
      ...source.proactive,
      enabled: true,
      smartCheckins: true,
      schedules: [],
      events: [],
      candidates: [],
      history: [],
    },
  };
}

export async function runStage18IntegrationTests(): Promise<void> {
  const userA = 'stage18-account-a';
  const userB = 'stage18-account-b';
  const priya = fixtureCompanion('priya', userA, 'Priya', 'Warm and caring');
  const latha = fixtureCompanion('latha', userA, 'Latha', 'Thoughtful and reflective');
  const accountBCompanion = fixtureCompanion('latha-b', userB, 'Anika', 'Analytical and calm');

  const tea = promoteMemoryCandidate([], extractMemoryCandidate('I prefer tea before important meetings.', {
    id: 'memory-tea',
    userId: userA,
    companionId: priya.id,
    scope: 'companion',
  }))[0];
  check(tea?.status === 'accepted', 'memory candidate promotes into an active memory');
  const reinforced = promoteMemoryCandidate([tea], extractMemoryCandidate('I prefer tea before important meetings.', {
    id: 'memory-tea-duplicate',
    userId: userA,
    companionId: priya.id,
    scope: 'companion',
  }));
  check(reinforced.length === 1 && (reinforced[0].reinforcementCount || 0) > 0, 'duplicate memory candidates reinforce without duplicating');
  const archived = { ...reinforced[0], archived: true, status: 'archived' as const };
  const relationship = applyRelationshipSignal(
    applyRelationshipSignal(priya.relationshipState, userA, priya.id, {
      id: 'conversation-1', type: 'conversation_completed', occurredAt: '2026-01-02T10:00:00.000Z', sourceMessageId: 'message-1',
    }),
    userA,
    priya.id,
    { id: 'memory-reinforced-1', type: 'memory_reinforced', occurredAt: '2026-01-02T10:01:00.000Z' },
  );
  const duplicateRelationship = applyRelationshipSignal(relationship, userA, priya.id, {
    id: 'memory-reinforced-1', type: 'memory_reinforced', occurredAt: '2026-01-02T10:01:00.000Z',
  });
  check(duplicateRelationship.interactionCount === relationship.interactionCount, 'duplicate relationship signals are idempotent');
  const withRelationship = { ...priya, memories: [reinforced[0], archived], relationshipState: relationship };

  const message: Message = {
    id: 'message-1', fromMe: true, type: 'text', text: 'I have an important meeting tomorrow.', status: 'sent',
    timestamp: new Date('2026-01-02T10:00:00.000Z'), replyToId: 'old-message', replyToText: 'How is work?', replyToAuthor: 'Priya',
  };
  const attachment = markAttachmentState(createAttachment({
    id: 'attachment-a', uri: 'file:///stage18/a.jpg', mimeType: 'image/jpeg', fileName: 'meeting.jpg',
    fileSize: 100, userId: userA, companionId: priya.id, messageId: message.id,
  }, 18), 'sent', 'ready');
  const companionContext = buildCompanionAIContext({
    companion: { ...withRelationship, memories: [reinforced[0], archived] },
    history: [message],
    userMessage: 'How should I prepare for my meeting?',
    userId: userA,
    attachments: [attachment],
  });
  check(companionContext.companion.name === 'Priya', 'selected companion identity reaches context');
  check(companionContext.memories.length === 1 && companionContext.memories[0].id === 'memory-tea', 'active relevant memory is included and archived memory is excluded');
  check(companionContext.relationship?.stage === relationship.stage, 'relationship summary reaches companion context');
  check(companionContext.shortTerm[0]?.replyToId === 'old-message', 'reply metadata remains in bounded recent context');
  check(companionContext.attachments.length === 1, 'attachment metadata reaches the provider-neutral context');
  check(!JSON.stringify(companionContext).includes('file:///'), 'local attachment URI does not reach provider context');
  check(buildCompanionAIContext({
    companion: { ...withRelationship, id: latha.id, memories: [reinforced[0]] },
    history: [message],
    userMessage: 'meeting',
    userId: userA,
  }).memories.length === 0, 'private memory does not leak across companions');

  const group: Group = {
    id: 'group-stage18', name: 'Integration Circle', companionIds: [priya.id, latha.id], unreadCount: 0,
    groupMemories: [buildMemoryRecord('We meet on Fridays as a group.', { id: 'group-memory', userId: userA, groupId: 'group-stage18', scope: 'group', status: 'accepted' })],
    proactive: { ...priya.proactive, schedules: [{ id: 'group-schedule', label: 'Friday circle', datetime: '2026-01-10T10:00:00.000Z', channel: 'chat', status: 'scheduled', message: 'Group check-in' }] },
  };
  const groupMessage: Message = { ...message, id: 'group-message', groupId: group.id };
  const groupContext = buildGroupAIContext({ group, companions: [withRelationship, latha], messages: [groupMessage], userMessage: '@Priya help us plan', targetCompanionId: priya.id });
  check(groupContext.targetCompanionId === priya.id, 'explicit group targeting selects the requested companion');
  check(groupContext.memories.length === 1 && groupContext.memories[0].scope === 'group', 'group context includes only group memories');
  const groupRequest = buildAIRequest(withRelationship, [], 'help us plan', 'online', 'group', group.id, [groupMessage], [{ memberId: priya.id, displayName: 'Priya' }], userA, group, [withRelationship, latha]);
  check(!groupRequest.attachedContext?.memories.length && !groupRequest.attachedContext?.relationship, 'group AI request excludes private memory and relationship context');

  const now = new Date('2026-01-03T12:00:00.000Z');
  const proactiveDecision = evaluateProactive(withRelationship, now, [], userA, [reinforced[0]]);
  check(proactiveDecision.status === 'allowed' && proactiveDecision.event && proactiveDecision.candidate, 'memory-aware proactive candidate is eligible');
  const proactiveConfig = appendProactiveEvent(withRelationship.proactive, proactiveDecision.event!, proactiveDecision.candidate!, userA);
  const delivered = markProactiveDelivered(proactiveConfig, proactiveDecision.event!.id, now);
  check(delivered.history?.[0]?.status === 'delivered', 'proactive delivery history is recorded');
  check(evaluateProactive({ ...withRelationship, proactive: delivered }, now, delivered.events, userA, [reinforced[0]]).status === 'not-due', 'duplicate proactive delivery is suppressed');

  const voiceUser = createVoiceUserMessage('voice-user-1', 'file:///voice.m4a', 4, now);
  const voiceAssistant = createAssistantVoiceMessage('voice-assistant-1', 'I heard you.', 'file:///reply.wav', now);
  check(voiceUser.type === 'voice' && voiceUser.status === 'sending' && voiceAssistant.voicePlaybackAvailable, 'voice metadata flows from recording to assistant response');
  let attempts = 0;
  await retryVoiceOperation(async () => { attempts += 1; if (attempts < 2) throw new Error('timeout'); return 'recovered'; });
  check(attempts === 2, 'voice retry boundary is deterministic');
  const liveInstruction = buildLiveSystemInstruction({
    companion: { id: priya.id, name: priya.name, personality: priya.personality, language: priya.language, aiConfig: priya.aiConfig },
    memoryContext: ['I prefer tea before important meetings.'],
    relationshipContext: relationshipContext(relationship) && { stage: relationship.stage, familiarity: relationship.familiarity, trust: relationship.trust, closeness: relationship.closeness },
    recentConversation: [message],
  });
  check(liveInstruction.includes('You are Priya') && liveInstruction.includes('I prefer tea'), 'Live context preserves selected companion and bounded memory');
  check(!liveInstruction.includes(userB), 'Live context does not contain another account identity');

  const serializedCompanions = JSON.parse(JSON.stringify([withRelationship, accountBCompanion]));
  const serializedConversations = JSON.parse(JSON.stringify({ [priya.id]: [message, message, voiceUser, voiceAssistant] }));
  const hydratedCompanions = hydrateCompanions(serializedCompanions, [priya, accountBCompanion], userA);
  const hydratedConversations = hydrateConversations(serializedConversations);
  const hydratedGroups = hydrateGroups(JSON.parse(JSON.stringify([group])), []);
  check(hydratedConversations[priya.id].length === 3, 'restart hydration collapses duplicate message IDs');
  check(hydratedCompanions.find((item) => item.id === priya.id)?.relationshipState?.conversationCount === relationship.conversationCount, 'relationship metrics survive restart hydration');
  check(hydratedGroups[0]?.id === group.id && hydratedGroups[0].companionIds.length === 2, 'group membership survives restart hydration');
  check(userStorageKeys(userA).conversations !== userStorageKeys(userB).conversations, 'account storage namespaces remain isolated');
  check(buildCompanionAIContext({ companion: accountBCompanion, history: [], userMessage: 'meeting', userId: userB, attachments: [attachment] }).attachments.length === 0, 'account B cannot use account A attachment metadata');
  check(toAttachmentContext([normalizeAttachment({ ...attachment, localUri: undefined, lifecycle: 'sent' })!], userA, priya.id)[0]?.missing, 'missing media remains representable after hydration');
  check(getRelevantMemories([reinforced[0], archived], 8, { userId: userA, companionId: priya.id }).length === 1, 'memory retrieval excludes archived state');

  console.log('Stage 18 automated integration tests passed.');
}
