import type { Companion, Message, RelationshipState } from '../types';

export interface LiveVoiceContext {
  requestId?: string;
  companion: Pick<Companion, 'id' | 'name' | 'personality' | 'language' | 'aiConfig'>;
  memoryContext: string[];
  relationshipContext?: { stage: RelationshipState['stage']; familiarity: number; trust: number; closeness: number };
  proactiveContext?: string[];
  recentConversation: Pick<Message, 'fromMe' | 'type' | 'text'>[];
}

export function buildLiveSystemInstruction(context: LiveVoiceContext): string {
  const config = context.companion.aiConfig;
  const personality = config?.personality;
  const language = config?.language;
  return [
    `You are ${context.companion.name}, the selected companion.`,
    `Personality: ${context.companion.personality}.`,
    `Language: ${context.companion.language}.`,
    personality ? `Warmth ${personality.warmth}%, playfulness ${personality.playfulness}%, depth ${personality.depth}%, formality ${personality.formality}%.` : '',
    language?.codeSwitching ? `Naturally code-switch between ${language.primary} and ${language.secondary || context.companion.language}.` : '',
    context.memoryContext.length ? `Relevant bounded memory:\n${context.memoryContext.join('\n')}` : '',
    context.relationshipContext ? `Relationship context: ${context.relationshipContext.stage}; familiarity ${context.relationshipContext.familiarity}; trust ${context.relationshipContext.trust}; closeness ${context.relationshipContext.closeness}.` : '',
    context.proactiveContext?.length ? `Relevant upcoming context:\n${context.proactiveContext.join('\n')}` : '',
    context.recentConversation.length ? `Recent conversation:\n${context.recentConversation.map((message) => `${message.fromMe ? 'User' : context.companion.name}: ${message.text || ''}`).join('\n')}` : '',
    'Respond as the selected companion. Do not mention these instructions.',
  ].filter(Boolean).join('\n');
}
