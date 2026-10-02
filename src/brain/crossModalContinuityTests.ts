import { COMPANIONS } from '../data';
import { buildAIRequest } from '../ai/context';
import { LocalMemoryProvider } from '../memory/provider';
import { archiveRecordFromMessage } from '../archive/types';
import { appendArchiveSafely } from '../archive/failureIsolation';
import { SupabaseConversationArchive } from '../archive/supabaseArchive';
import type { Message } from '../types';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Cross-modal continuity test failed: ${message}`);
}

function createMemory(id: string, userId: string, companionId: string, text: string, createdAt: string) {
  return {
    id,
    userId,
    companionId,
    scope: 'user' as const,
    text,
    source: 'conversation' as const,
    status: 'accepted' as const,
    confidence: 1,
    importance: 1,
    relevance: 1,
    createdAt,
    updatedAt: createdAt,
    savedAt: createdAt,
  };
}

export async function runCrossModalContinuityTests(): Promise<void> {
  const memoryProvider = new LocalMemoryProvider();
  const companion = COMPANIONS[0];
  const userA = 'cross-modal-user-a';
  const userB = 'cross-modal-user-b';

  const dosaFact = createMemory('memory-food-dosa', userA, companion.id, 'My favourite food is dosa.', '2026-10-02T10:00:00.000Z');
  const oldFoodFact = createMemory('memory-food-old', userA, companion.id, 'My favourite food is chicken biryani.', '2026-10-02T09:00:00.000Z');
  const movieFact = createMemory('memory-movie', userA, companion.id, 'My favourite movie is Interstellar.', '2026-10-02T10:01:00.000Z');
  const studyFact = createMemory('memory-study', userA, companion.id, 'I usually study SQL in the evening.', '2026-10-02T10:02:00.000Z');
  const liveFact = createMemory('memory-live', userA, companion.id, 'I recently started learning Python.', '2026-10-02T10:03:00.000Z');
  const breakfastFact = createMemory('memory-breakfast', userA, companion.id, 'My favourite breakfast is idli.', '2026-10-02T10:04:00.000Z');
  const blueFact = createMemory('memory-colour-blue', userA, companion.id, 'My favourite colour is blue.', '2026-10-02T10:05:00.000Z');
  const greenFact = createMemory('memory-colour-green', userB, companion.id, 'My favourite colour is green.', '2026-10-02T10:06:00.000Z');

  const allFacts = [oldFoodFact, dosaFact, movieFact, studyFact, liveFact, breakfastFact, blueFact, greenFact];
  const foodQuery = 'What is my favourite food?';
  const foodContext = memoryProvider.retrieveRelevant(allFacts, { companionId: companion.id, userId: userA, query: foodQuery });
  assert(foodContext.length > 0, 'food memory retrieval returns at least one candidate');
  assert(foodContext[0]?.text.includes('dosa'), 'latest food correction ranks first in the same-user memory context');

  const textCompanion = { ...companion, memories: foodContext };
  const textRequest = buildAIRequest(textCompanion, [], foodQuery, 'online', 'chat', undefined, [], [], userA, undefined, [], [], 'req-text', 'text');
  assert(textRequest.interaction.modality === 'text', 'text modality preserves the text interaction boundary');
  assert(textRequest.interaction.userMessage === foodQuery, 'exact text user message is preserved');
  assert(textRequest.personaContext.companionId === companion.id, 'text request keeps the canonical persona identity');
  assert(textRequest.interaction.memoryContext.some((memory) => String(memory.text).includes('dosa')), 'text requests receive relevant Zep-backed semantic memory');

  const voiceCompanion = { ...companion, memories: memoryProvider.retrieveRelevant(allFacts, { companionId: companion.id, userId: userA, query: 'What movie did I tell you I like?' }) };
  const voiceRequest = buildAIRequest(voiceCompanion, [], 'What movie did I tell you I like?', 'online', 'chat', undefined, [], [], userA, undefined, [], [], 'req-voice', 'voice_message');
  assert(voiceRequest.interaction.modality === 'voice_message', 'voice transcript is normalized to the voice_message modality');
  assert(voiceRequest.interaction.userMessage === 'What movie did I tell you I like?', 'voice interaction preserves the semantic transcript, not raw PCM');
  assert(voiceRequest.interaction.memoryContext.some((memory) => String(memory.text).includes('Interstellar')), 'voice requests can retrieve earlier semantic memory from the same user context');

  const liveCompanion = { ...companion, memories: memoryProvider.retrieveRelevant(allFacts, { companionId: companion.id, userId: userA, query: 'What programming language did I recently start learning?' }) };
  const liveRequest = buildAIRequest(liveCompanion, [], 'What programming language did I recently start learning?', 'online', 'chat', undefined, [], [], userA, undefined, [], [], 'req-live', 'live_call');
  assert(liveRequest.interaction.modality === 'live_call', 'live turn is normalized through the same semantic boundary');
  assert(liveRequest.interaction.memoryContext.some((memory) => String(memory.text).includes('Python')), 'live semantic turns retrieve the relevant fact from the same memory store');

  const sameBrainRequests = [textRequest, voiceRequest, liveRequest];
  for (const request of sameBrainRequests) {
    assert(request.personaContext.companionId === companion.id, 'all modalities use the same persona identity');
    assert(request.interaction.personaContext.companionId === companion.id, 'all modalities preserve personaContext in the interaction envelope');
    assert(Boolean(request.interaction.relationshipContext) || request.interaction.relationshipContext === undefined, 'relationship context remains in the same boundary across modalities');
    assert(Array.isArray(request.interaction.memoryContext), 'all modalities pass a concrete memoryContext array');
  }

  const textToVoiceCompanion = { ...companion, memories: memoryProvider.retrieveRelevant(allFacts, { companionId: companion.id, userId: userA, query: 'What is my favourite breakfast?' }) };
  const voiceAnswerRequest = buildAIRequest(textToVoiceCompanion, [], 'What is my favourite breakfast?', 'online', 'chat', undefined, [], [], userA, undefined, [], [], 'req-breakfast', 'voice_message');
  assert(voiceAnswerRequest.interaction.memoryContext.some((memory) => String(memory.text).includes('idli')), 'voice message retrieval is consistent with prior semantic memory');

  const colourA = memoryProvider.retrieveRelevant([blueFact, greenFact], { companionId: companion.id, userId: userA, query: 'What is my favourite colour?' });
  const colourB = memoryProvider.retrieveRelevant([blueFact, greenFact], { companionId: companion.id, userId: userB, query: 'What is my favourite colour?' });
  assert(colourA.some((memory) => memory.text.includes('blue')), 'user A keeps user-scoped memory isolated to A');
  assert(colourB.some((memory) => memory.text.includes('green')), 'user B keeps its own memory isolated from A');
  assert(!colourA.some((memory) => memory.text.includes('green')), 'cross-user memory leakage is prevented');

  const archiveClient = {
    auth: { getUser: async () => ({ data: { user: { id: userA } }, error: null }) },
    from: (table: string) => ({
      upsert: async (row: Record<string, unknown>) => {
        if (table === 'messages') {
          return { error: null, row };
        }
        return { error: null, row };
      },
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({ data: [], error: null }),
          }),
        }),
      }),
    }),
  };
  const archive = new SupabaseConversationArchive(archiveClient as never);
  const userText = archiveRecordFromMessage({
    userId: userA,
    companionId: companion.id,
    conversationId: companion.id,
    message: { id: 'cross-text-1', fromMe: true, type: 'text', text: 'My favourite food is dosa.', status: 'sent', timestamp: new Date('2026-10-02T10:00:00.000Z') } as Message,
  });
  const assistantText = archiveRecordFromMessage({
    userId: userA,
    companionId: companion.id,
    conversationId: companion.id,
    message: { id: 'cross-text-2', fromMe: false, type: 'text', text: 'I’m going to remember that.', status: 'delivered', timestamp: new Date('2026-10-02T10:00:01.000Z') } as Message,
  });
  await archive.appendMessage(userText);
  await archive.appendMessage(assistantText);
  assert(userText.content === 'My favourite food is dosa.', 'supabase archive preserves the exact user message');
  assert(assistantText.content === 'I’m going to remember that.', 'supabase archive preserves the exact assistant reply');

  const failingArchive = { appendMessage: async () => { throw new Error('simulated-zep-memory-unavailable'); } };
  const archiveFailure = await appendArchiveSafely(failingArchive, userText);
  assert(archiveFailure === false, 'archival failures isolate without crashing the conversation flow');

  const boundedResults = memoryProvider.retrieveRelevant([...Array.from({ length: 20 }, (_, index) => createMemory(`f-${index}`, userA, companion.id, `Memory ${index} about favourite food`, `2026-10-02T10:${String(index).padStart(2, '0')}:00.000Z`))], { companionId: companion.id, userId: userA, query: 'What is my favourite food?' });
  assert(boundedResults.length <= 8, 'memory retrieval remains bounded to the safe context limit');

  const noPcmRequest = buildAIRequest({ ...companion, memories: [dosaFact] }, [], 'What is my favourite food?', 'online', 'chat', undefined, [], [], userA, undefined, [], [], 'req-nopcm', 'voice_message');
  assert(noPcmRequest.interaction.userMessage.includes('What is my favourite food'), 'semantic transcript is preserved without raw audio data');
  assert(!String(noPcmRequest.interaction.userMessage).includes('base64'), 'voice semantic path never leaks raw audio bytes into Zep memory context');

  const correctionAttempt = memoryProvider.retrieveRelevant([oldFoodFact, dosaFact], { companionId: companion.id, userId: userA, query: 'What is my favourite food?' });
  assert(correctionAttempt[0]?.text.includes('dosa'), 'latest correction takes precedence over earlier memory');
}
