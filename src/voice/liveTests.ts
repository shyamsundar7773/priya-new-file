import type { Companion } from '../types';
import { buildLiveSystemInstruction } from './liveContext';

export function runLiveVoiceContractTests(companion: Companion): void {
  const context = {
    companion: {
      id: companion.id,
      name: companion.name,
      personality: companion.personality,
      language: companion.language,
      aiConfig: companion.aiConfig,
    },
    memoryContext: ['User prefers tea.'],
    recentConversation: [{ fromMe: true, type: 'text' as const, text: 'I need some motivation.' }],
  };
  const instruction = buildLiveSystemInstruction(context);
  if (!instruction.includes(companion.name) || !instruction.includes(companion.personality)) {
    throw new Error('Live companion identity/personality context was not propagated.');
  }
  if (!instruction.includes('User prefers tea.') || !instruction.includes('I need some motivation.')) {
    throw new Error('Live bounded memory or recent conversation context was not propagated.');
  }
  if (instruction.includes('GEMINI_API_KEY') || instruction.includes('ELEVENLABS_API_KEY')) {
    throw new Error('Live client context contains a provider secret.');
  }
}
