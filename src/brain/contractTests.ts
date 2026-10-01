import { COMPANIONS } from '../data';
import { buildAIRequest } from '../ai/context';
import { extractMemoryCandidate } from '../memory/lifecycle';
import { LocalMemoryProvider } from '../memory/provider';
import { buildRelationshipContext } from '../relationship/context';
import { AIBrain } from '../ai/brain';
import { MockAIProvider } from '../ai/providers/mockProvider';
import { archiveRecordFromMessage } from '../archive/types';
import { appendArchiveSafely } from '../archive/failureIsolation';
import { SupabaseConversationArchive } from '../archive/supabaseArchive';
import type { ConversationArchive } from '../archive';
import type { Message } from '../types';
import { buildPersonaContext } from './context';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Phase 1 architecture contract failed: ${message}`);
}

export async function runPhase1ArchitectureContractTests(): Promise<void> {
  const companion = COMPANIONS[0];
  const modalities = ['text', 'voice_message', 'live_call', 'proactive'] as const;
  for (const modality of modalities) {
    const request = buildAIRequest(companion, [], 'Hoy park polaam', 'online', 'chat', undefined, [], [], 'authenticated-user', undefined, [], [], `interaction-${modality}`, modality);
    assert(request.interaction.modality === modality, `${modality} modality normalization`);
    assert(request.interaction.userId === 'authenticated-user', 'authenticated user identity is carried');
    assert(request.interaction.userMessage === 'Hoy park polaam', 'exact semantic message is carried');
    assert(request.personaContext.name === companion.name, 'persona boundary reaches the request');
    assert(request.relationshipBoundary?.stage === companion.relationshipState?.stage || !companion.relationshipState, 'relationship context boundary reaches the request');
  }

  const local = new LocalMemoryProvider();
  const candidate = extractMemoryCandidate('I prefer tea each morning because it helps me focus.', {
    userId: 'authenticated-user',
    companionId: companion.id,
    scope: 'companion',
    source: 'conversation',
  });
  const promoted = local.promote([], candidate);
  assert(promoted.some((memory) => memory.id === candidate.id), 'LocalMemoryProvider delegates promotion to the existing lifecycle');
  const selected = local.retrieveRelevant(promoted, { userId: 'authenticated-user', companionId: companion.id, query: 'What tea do I prefer?' });
  assert(selected.some((memory) => memory.id === candidate.id), 'LocalMemoryProvider retrieves relevant local memory');
  const updated = local.update(promoted, candidate.id, { category: 'Updated' });
  assert(updated.find((memory) => memory.id === candidate.id)?.category === 'Updated', 'LocalMemoryProvider delegates updates to lifecycle');
  assert(Boolean(local.archive(updated, candidate.id).find((memory) => memory.id === candidate.id)?.archived), 'LocalMemoryProvider delegates archive to lifecycle');

  const groupRequest = buildAIRequest({ ...companion, relationshipState: companion.relationshipState || undefined }, [], 'hello', 'online', 'group', 'group-1', [], [], 'authenticated-user');
  assert(!groupRequest.relationshipBoundary && !groupRequest.interaction.relationshipContext, 'group context excludes private relationship data');
  assert(buildPersonaContext(companion).personality === companion.personality, 'persona wording is preserved');
  assert(buildRelationshipContext(companion.relationshipState)?.stage === companion.relationshipState?.stage || !companion.relationshipState, 'relationship boundary reuses current relationship state');

  const voiceRequest = buildAIRequest(companion, [], 'Voice transcript exact words', 'online', 'voice', undefined, [], [], 'authenticated-user', undefined, [], [], 'voice-id');
  assert(voiceRequest.interaction.modality === 'voice_message' && voiceRequest.userMessage === 'Voice transcript exact words', 'voice message exposes semantic transcript, not audio');
  const callMessage: Message = {
    id: 'call-event',
    fromMe: true,
    type: 'call',
    callId: 'call-event',
    callOutcome: 'completed',
    status: 'sent',
    timestamp: new Date('2026-10-02T00:00:00.000Z'),
  };
  const archivedCall = archiveRecordFromMessage({ userId: 'authenticated-user', companionId: companion.id, conversationId: companion.id, message: callMessage });
  assert(archivedCall.modality === 'live_call' && archivedCall.metadata.callOutcome === 'completed', 'call summary archives as a canonical event without PCM');

  const archiveRows = new Map<string, Record<string, unknown>>();
  const archiveClient = {
    auth: { getUser: async () => ({ data: { user: { id: 'authenticated-user' } }, error: null }) },
    from: (table: string) => ({
      upsert: async (row: Record<string, unknown>, options: { onConflict: string }) => {
        assert(options.onConflict === 'user_id,id', 'archive upsert uses user-scoped idempotency key');
        archiveRows.set(`${table}:${row.user_id}:${row.id}`, row);
        return { error: null };
      },
    }),
  };
  const archive = new SupabaseConversationArchive(archiveClient as never);
  const exactMessage = archiveRecordFromMessage({
    userId: 'authenticated-user',
    companionId: companion.id,
    conversationId: companion.id,
    message: { ...callMessage, id: 'exact-message', type: 'text', text: 'Hoy park polaam', timestamp: new Date('2026-10-02T00:00:00.000Z') },
  });
  await archive.appendMessage(exactMessage);
  await archive.appendMessage(exactMessage);
  assert(archiveRows.get('messages:authenticated-user:exact-message')?.content === 'Hoy park polaam', 'archive preserves exact original message content');
  assert(archiveRows.get('messages:authenticated-user:exact-message')?.created_at === '2026-10-02T00:00:00.000Z', 'archive preserves timezone-unambiguous event timestamp');
  const rejectingArchive = new SupabaseConversationArchive({
    auth: { getUser: async () => ({ data: { user: { id: 'different-user' } }, error: null }) },
  } as never);
  let ownershipRejected = false;
  try {
    await rejectingArchive.appendMessage(exactMessage);
  } catch {
    ownershipRejected = true;
  }
  assert(ownershipRejected, 'archive rejects caller identity that differs from authenticated Supabase user');

  const failingArchive: ConversationArchive = { appendMessage: async () => { throw new Error('controlled archive failure'); } };
  const brain = new AIBrain(new MockAIProvider());
  const [response, archiveSucceeded] = await Promise.all([
    brain.respond(buildAIRequest(companion, [], 'Still answer when archive is down.', 'online', 'chat', undefined, [], [], 'authenticated-user')),
    appendArchiveSafely(failingArchive, archiveRecordFromMessage({
      userId: 'authenticated-user',
      companionId: companion.id,
      conversationId: companion.id,
      message: { ...callMessage, id: 'archive-failure-case', type: 'text', text: 'exact failed archive sample' },
    })),
  ]);
  assert(response.status === 'success', 'archive failure does not block the AI response');
  assert(!archiveSucceeded, 'failed archive is never represented as success');

}
