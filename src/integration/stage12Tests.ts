import { COMPANIONS } from '../data';
import { applyRelationshipSignal, createRelationshipState } from '../relationship/engine';
import { appendProactiveEvent, appendScheduledMoment, markProactiveDelivered } from '../proactive/engine';
import { buildMemoryRecord, promoteMemoryCandidate } from '../storage/memoryStore';
import { hydrateCompanions, hydrateConversations, hydrateGroups } from '../storage/serialize';
import { normalizePreferences } from '../storage/preferences';
import { userStorageKeys } from '../storage/keys';
import type { Group, Message } from '../types';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Stage 12 persistence contract failed: ${message}`);
}

export function runStage12PersistenceContractTests(): void {
  const userA = 'stage12-user-a';
  const userB = 'stage12-user-b';
  const priya = COMPANIONS[0];
  const latha = COMPANIONS[1] || { ...priya, id: 'latha', name: 'Latha' };

  const memory = promoteMemoryCandidate([], buildMemoryRecord('The user prefers tea in the morning', {
    userId: userA,
    companionId: priya.id,
    scope: 'companion',
  }))[0];
  const archived = { ...memory, id: 'archived', archived: true, status: 'archived' as const };
  const deleted = { ...memory, id: 'deleted', deleted: true, status: 'deleted' as const };
  const superseded = { ...memory, id: 'superseded', status: 'superseded' as const };
  const relationshipState = applyRelationshipSignal(
    createRelationshipState(userA, priya.id, '2026-09-25T00:00:00.000Z'),
    userA,
    priya.id,
    { id: 'relationship-event', type: 'conversation_completed', meaningful: true, occurredAt: '2026-09-25T00:01:00.000Z' },
  );
  const proactive = markProactiveDelivered(
    appendProactiveEvent(
      appendScheduledMoment({ ...priya.proactive, enabled: true, schedules: [] }, {
        id: 'scheduled',
        userId: userA,
        companionId: priya.id,
        label: 'Check in',
        datetime: '2026-09-25T01:00:00.000Z',
        channel: 'chat',
      }),
      {
        id: 'event',
        userId: userA,
        companionId: priya.id,
        type: 'scheduled-moment',
        createdAt: '2026-09-25T00:02:00.000Z',
        status: 'allowed',
        channel: 'chat',
        reason: 'scheduled',
      },
      undefined,
      userA,
    ),
    'event',
  );
  const persistedCompanion = {
    ...priya,
    memories: [memory, archived, deleted, superseded],
    relationshipState,
    proactive,
  };
  const hydratedA = hydrateCompanions([JSON.parse(JSON.stringify(persistedCompanion))], COMPANIONS, userA)[0];
  assert(hydratedA.memories.some((item) => item.status === 'archived'), 'archived memory status survives hydration');
  assert(hydratedA.memories.some((item) => item.status === 'deleted'), 'deleted memory status survives hydration');
  assert(hydratedA.memories.some((item) => item.status === 'superseded'), 'superseded memory status survives hydration');
  assert(hydratedA.relationshipState?.stage === 'familiar', 'relationship stage survives hydration');
  assert(hydratedA.relationshipState?.milestones.some((milestone) => milestone.id === 'milestone:first_conversation') === true, 'relationship milestones survive hydration');
  assert(hydratedA.proactive.schedules[0]?.status === 'scheduled', 'scheduled proactive state survives hydration');
  assert(hydratedA.proactive.history?.some((item) => item.status === 'delivered') === true, 'proactive history survives hydration');
  assert(hydratedA.proactive.events?.some((item) => item.status === 'delivered') === true, 'proactive delivery state survives hydration');

  const hydratedB = hydrateCompanions([JSON.parse(JSON.stringify(persistedCompanion))], COMPANIONS, userB)[0];
  assert(hydratedB.relationshipState === undefined, 'relationship state does not cross users');
  assert(userStorageKeys(userA).companions !== userStorageKeys(userB).companions, 'companion storage namespaces differ by user');

  const group: Group = {
    id: 'group-a',
    name: 'Circle',
    companionIds: [priya.id],
    unreadCount: 0,
    archived: true,
    groupMemories: [{ ...memory, id: 'group-memory', scope: 'group', groupId: 'group-a' }],
  };
  const hydratedGroups = hydrateGroups([JSON.parse(JSON.stringify(group))], [],);
  assert(hydratedGroups[0]?.archived === true, 'group archive state survives hydration');
  assert(hydratedGroups[0]?.groupMemories?.[0]?.groupId === 'group-a', 'group-scoped memory survives hydration');

  const duplicateMessage: Message = {
    id: 'voice-1',
    fromMe: true,
    type: 'voice',
    status: 'failed',
    text: 'transcript',
    voiceAudioUri: 'file:///recording.m4a',
    voiceTranscription: 'transcript',
    timestamp: new Date('2026-09-25T00:03:00.000Z'),
  };
  const duplicateRecovery = hydrateConversations({
    [priya.id]: [
      JSON.parse(JSON.stringify(duplicateMessage)),
      { ...JSON.parse(JSON.stringify(duplicateMessage)), status: 'delivered' },
    ],
  })[priya.id];
  assert(duplicateRecovery.length === 1 && duplicateRecovery[0].status === 'delivered', 'duplicate persisted messages collapse during hydration');
  assert(duplicateRecovery[0].voiceAudioUri === 'file:///recording.m4a', 'voice metadata survives hydration');
  assert(hydrateConversations({ [latha.id]: [{ id: 'missing-audio', fromMe: false, type: 'voice', status: 'delivered', voiceAudioUri: 'file:///missing.m4a', timestamp: new Date() }] })[latha.id].length === 1, 'missing audio reference does not corrupt message hydration');

  const preferences = normalizePreferences(JSON.parse(JSON.stringify({
    theme: 'light',
    notificationSettings: { proactiveMessages: false },
  })));
  assert(preferences.theme === 'light' && preferences.notificationSettings.proactiveMessages === false, 'preferences survive normalization');
}
