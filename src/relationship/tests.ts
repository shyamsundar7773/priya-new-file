import { buildAIRequest } from '../ai/context';
import { COMPANIONS } from '../data';
import { hydrateCompanions, hydrateRelationshipState } from '../storage/serialize';
import { applyRelationshipSignal, archiveRelationship, resetRelationship } from './engine';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Relationship contract test failed: ${message}`);
}

export function runRelationshipContractTests(): void {
  const companion = COMPANIONS[0];
  const userA = 'user-a';
  const userB = 'user-b';
  const first = applyRelationshipSignal(undefined, userA, companion.id, {
    id: 'conversation:1',
    type: 'conversation_completed',
    occurredAt: '2026-01-01T00:00:00.000Z',
    meaningful: true,
  });
  assert(first.stage === 'familiar', 'first conversation creates familiar state');
  assert(first.conversationCount === 1 && first.interactionCount === 1, 'first conversation counts once');
  assert(first.milestones.some((item) => item.id === 'milestone:first_conversation'), 'first milestone created');

  const duplicate = applyRelationshipSignal(first, userA, companion.id, { id: 'conversation:1', type: 'conversation_completed' });
  assert(duplicate.interactionCount === 1, 'duplicate event is ignored');

  const repeated = applyRelationshipSignal(first, userA, companion.id, {
    id: 'conversation:2',
    type: 'conversation_completed',
    meaningful: true,
    occurredAt: '2026-01-02T00:00:00.000Z',
  });
  assert(repeated.conversationCount === 2 && repeated.familiarity > first.familiarity, 'repeated conversation progresses familiarity');

  const reinforced = applyRelationshipSignal(repeated, userA, companion.id, {
    id: 'memory:1',
    type: 'memory_reinforced',
    provenance: 'memory promotion',
  });
  assert(reinforced.trust > repeated.trust && reinforced.closeness > repeated.closeness, 'memory reinforcement updates trust and closeness');
  assert(reinforced.milestones.some((item) => item.id === 'milestone:meaningful_memory'), 'meaningful memory milestone created');

  let longRun = reinforced;
  for (let index = 0; index < 100; index += 1) {
    longRun = applyRelationshipSignal(longRun, userA, companion.id, {
      id: `conversation:${index + 3}`,
      type: 'conversation_completed',
      meaningful: true,
    });
  }
  assert(longRun.familiarity <= 100 && longRun.trust <= 100 && longRun.closeness <= 100, 'metrics remain bounded');
  assert(longRun.stage === 'deep', 'long meaningful interaction sequence reaches deep stage');
  assert(longRun.events.length <= 64 && longRun.milestones.length <= 16, 'history remains bounded');

  const otherUser = applyRelationshipSignal(undefined, userB, companion.id, { id: 'conversation:b', type: 'conversation_completed' });
  assert(otherUser.userId === userB && otherUser.interactionCount === 1, 'user relationship state is isolated');
  const otherCompanion = applyRelationshipSignal(undefined, userA, 'latha', { id: 'conversation:l', type: 'conversation_completed' });
  assert(otherCompanion.companionId === 'latha', 'companion relationship state is isolated');

  const request = buildAIRequest({ ...companion, relationshipState: first }, [], 'hello', 'online');
  assert(request.relationshipContext?.stage === 'familiar', 'relationship state reaches AI context');
  const groupRequest = buildAIRequest({ ...companion, relationshipState: first }, [], 'hello', 'online', 'group', 'group-1', []);
  assert(!groupRequest.relationshipContext, 'private relationship state is excluded from group context');

  const archived = archiveRelationship(first);
  assert(archived.archived && !buildAIRequest({ ...companion, relationshipState: archived }, [], 'hello', 'online').relationshipContext, 'archived relationship is excluded from context');
  const reset = resetRelationship(userA, companion.id);
  assert(reset.interactionCount === 0 && reset.stage === 'new', 'reset clears progression');

  const recovered = hydrateRelationshipState(JSON.parse(JSON.stringify(first)), userA, companion.id);
  assert(recovered?.conversationCount === first.conversationCount, 'relationship serialization round trip works');
  assert(hydrateRelationshipState({ malformed: true }, userA, companion.id) === undefined, 'corrupt relationship data recovers safely');
  const hydrated = hydrateCompanions([{ ...companion, relationshipState: first }], [companion], userA);
  assert(hydrated[0].relationshipState?.userId === userA, 'companion hydration preserves scoped relationship');
}
