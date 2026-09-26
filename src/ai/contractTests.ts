import { COMPANIONS, INITIAL_CONVERSATIONS } from '../data';
import { buildAIRequest } from './context';
import { AIBrain } from './brain';
import { MockAIProvider } from './providers/mockProvider';
import { buildCompanionAIContext, selectRelevantMemories } from './attachmentContext';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`AI contract test failed: ${message}`);
}

export async function runAIContractTests(): Promise<void> {
  const companion = COMPANIONS[0];
  const provider = new MockAIProvider();
  const brain = new AIBrain(provider);
  const request = buildAIRequest(companion, INITIAL_CONVERSATIONS[companion.id], 'Hello', 'online');
  const success = await brain.respond(request);

  assert(success.status === 'success', 'mock provider returns success');
  assert(success.text?.includes(companion.name) === true, 'response is companion-aware');
  assert(request.history.length > 0, 'conversation history reaches the request');
  assert(request.companion.personality.length > 0, 'personality reaches the request');
  assert(request.companion.language.length > 0, 'language reaches the request');
  assert(request.attachedContext?.companion.id === companion.id, 'canonical companion identity is attached');
  assert((request.attachedContext?.shortTerm.length || 0) <= 12, 'short-term context is bounded');

  const relevant = selectRelevantMemories([
    { id: 'tea', text: 'User prefers tea in the morning', source: 'conversation', scope: 'companion', companionId: companion.id, importance: 0.8, confidence: 0.9 },
    { id: 'music', text: 'User enjoys old Tamil songs', source: 'conversation', scope: 'companion', companionId: 'latha', importance: 0.9, confidence: 0.9 },
    { id: 'archived', text: 'User used to prefer coffee', source: 'conversation', scope: 'companion', companionId: companion.id, archived: true, importance: 1, confidence: 1 },
  ], 'What should I drink this morning?', companion.id);
  assert(relevant.some((memory) => memory.id === 'tea'), 'relevant memory is selected');
  assert(!relevant.some((memory) => memory.id === 'music' || memory.id === 'archived'), 'isolated and archived memories are excluded');
  const groupContext = buildCompanionAIContext({ companion, history: [], userMessage: 'tea', mode: 'group', groupId: 'group-1' });
  assert(groupContext.memories.length === 0 && !groupContext.relationship, 'group context excludes private attachment data');

  const baseConfig = companion.aiConfig || {
    personality: { warmth: 75, playfulness: 55, depth: 80, formality: 25 },
    language: { primary: 'English', codeSwitching: true },
    voice: { style: 'Warm', pace: 50, warmth: 80 },
    channels: { chat: true, voice: true, call: true, receipts: true },
  };
  const changed = buildCompanionAIContext({
    companion: { ...companion, aiConfig: { ...baseConfig, personality: { ...baseConfig.personality, warmth: 12 }, language: { ...baseConfig.language, codeSwitching: false } } },
    history: [],
    userMessage: 'hello',
  });
  assert(changed.companion.tone.warmth === 12 && changed.companion.language.codeSwitching === false, 'canonical personality and language settings reach context');

  const offline = await brain.respond({ ...request, providerStatus: 'offline' });
  assert(offline.status === 'offline', 'offline state is controlled');

  const failure = await brain.respond({ ...request, userMessage: '/fail' });
  assert(failure.status === 'error', 'provider failure is controlled');
}
