import type { Companion } from '../types';
import type { InteractionModality, PersonaContext } from './types';

export function normalizeInteractionModality(value: string | undefined): InteractionModality {
  if (value === 'voice' || value === 'voice_message') return 'voice_message';
  if (value === 'call' || value === 'live_call') return 'live_call';
  if (value === 'proactive') return 'proactive';
  return 'text';
}

export function buildPersonaContext(companion: Companion): PersonaContext {
  return {
    companionId: companion.id,
    name: companion.name,
    identity: companion.tagline,
    personality: companion.personality,
    language: companion.language,
    aiConfig: companion.aiConfig,
  };
}
