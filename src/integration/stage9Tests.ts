import { COMPANIONS } from '../data';
import { buildAIRequest } from '../ai/context';
import { buildCompanionAIContext } from '../ai/attachmentContext';
import { buildGroupAIContext } from '../groups/context';
import { buildMemoryRecord, promoteMemoryCandidate } from '../storage/memoryStore';
import { applyRelationshipSignal, createRelationshipState } from '../relationship/engine';
import { hydrateCompanions, hydrateConversations } from '../storage/serialize';
import { userStorageKeys } from '../storage/keys';
import type { Group, Message } from '../types';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Stage 9 integration contract failed: ${message}`);
}

export function runStage9IntegrationContractTests(): void {
  const priya = COMPANIONS[0];
  const latha = COMPANIONS[1] || { ...priya, id: 'latha', name: 'Latha' };
  const userId = 'stage9-user-a';
  const otherUserId = 'stage9-user-b';

  const tea = buildMemoryRecord('The user prefers tea in the morning', {
    userId,
    companionId: priya.id,
    scope: 'companion',
    status: 'candidate',
  });
  const music = buildMemoryRecord('The user enjoys old Tamil songs', {
    userId,
    companionId: latha.id,
    scope: 'companion',
    status: 'candidate',
  });
  const priyaMemories = promoteMemoryCandidate([], tea);
  const lathaMemories = promoteMemoryCandidate([], music);
  const priyaWithContext = {
    ...priya,
    memories: priyaMemories,
    relationshipState: applyRelationshipSignal(
      createRelationshipState(userId, priya.id),
      userId,
      priya.id,
      { id: 'conversation-1', type: 'conversation_completed', meaningful: true, occurredAt: '2026-09-25T00:00:00.000Z' },
    ),
  };

  const privateRequest = buildAIRequest(
    priyaWithContext,
    [{ id: 'history-1', fromMe: true, type: 'text', text: 'I had a busy morning.', status: 'sent', timestamp: new Date() }],
    'What should I drink this morning?',
    'online',
    'chat',
    undefined,
    [],
    [],
    userId,
  );
  assert(privateRequest.attachedContext?.memories.some((memory) => memory.text.includes('tea')) === true, 'relevant memory reaches companion context');
  assert(privateRequest.attachedContext?.memories.some((memory) => memory.text.includes('Tamil songs')) !== true, 'other companion memory is excluded');
  assert(privateRequest.attachedContext?.relationship?.stage === 'familiar', 'relationship state reaches companion context');
  assert(privateRequest.attachedContext?.shortTerm.length === 1, 'recent conversation reaches companion context');
  assert((privateRequest.attachedContext?.shortTerm.length || 0) <= 12, 'short-term context remains bounded');

  const archived = { ...tea, id: 'archived-tea', archived: true, status: 'archived' as const };
  const privateWithArchived = buildCompanionAIContext({
    companion: { ...priyaWithContext, memories: [...priyaMemories, archived] },
    history: [],
    userMessage: 'tea',
    userId,
  });
  assert(privateWithArchived.memories.every((memory) => !memory.archived), 'archived memory is excluded');

  const group: Group = {
    id: 'stage9-group',
    name: 'Evening Circle',
    companionIds: [priya.id, latha.id],
    unreadCount: 0,
    groupMemories: [{
      id: 'group-memory',
      text: 'The group prefers quiet evenings',
      source: 'conversation',
      scope: 'group',
      groupId: 'stage9-group',
      status: 'accepted',
    }],
  };
  const groupMessage: Message = {
    id: 'group-message',
    fromMe: true,
    type: 'text',
    text: '@Latha what do you think?',
    status: 'sent',
    timestamp: new Date(),
  };
  const groupContext = buildGroupAIContext({
    group,
    companions: [priyaWithContext, { ...latha, memories: lathaMemories }],
    messages: [groupMessage],
    userMessage: groupMessage.text || '',
    targetCompanionId: latha.id,
  });
  assert(groupContext.targetCompanionId === latha.id, 'explicit group targeting is preserved');
  assert(groupContext.memories.length === 1, 'group memory is available');
  assert(groupContext.shortTerm.length === 1, 'group history is available');
  assert(buildAIRequest(priyaWithContext, [], 'hello', 'online', 'group', group.id, [groupMessage], [], userId, group, [priyaWithContext, latha]).attachedContext?.memories.length === 0, 'private memory is excluded from group context');
  assert(!buildAIRequest(priyaWithContext, [], 'hello', 'online', 'group', group.id, [groupMessage], [], userId, group, [priyaWithContext, latha]).attachedContext?.relationship, 'private relationship is excluded from group context');

  const userAKeys = userStorageKeys(userId);
  const userBKeys = userStorageKeys(otherUserId);
  assert(userAKeys.conversations !== userBKeys.conversations, 'account conversation keys are isolated');
  assert(userAKeys.companions !== userBKeys.companions, 'account companion keys are isolated');
  assert(userAKeys.preferences !== userBKeys.preferences, 'account preference keys are isolated');

  const persisted = JSON.parse(JSON.stringify([priyaWithContext]));
  const hydrated = hydrateCompanions(persisted, COMPANIONS, userId);
  assert(hydrated[0]?.relationshipState?.userId === userId, 'relationship state hydrates for owning user');
  assert(hydrateCompanions(persisted, COMPANIONS, otherUserId)[0]?.relationshipState === undefined, 'relationship state does not hydrate across accounts');

  const first: Message = { id: 'late', fromMe: true, type: 'text', text: 'late', status: 'sent', timestamp: new Date('2026-09-25T00:00:02Z') };
  const second: Message = { id: 'early', fromMe: false, type: 'text', text: 'early', status: 'delivered', timestamp: new Date('2026-09-25T00:00:01Z') };
  const hydratedMessages = hydrateConversations({ [priya.id]: [first, second] })[priya.id];
  assert(hydratedMessages[0]?.id === 'early', 'conversation hydration restores timestamp ordering');
}
