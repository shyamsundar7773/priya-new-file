import type { Attachment } from '../attachments/model';
import type { Companion, Group, Message, MessageMention } from '../types';
import type { CompanionAIContext } from '../ai/attachmentContext';
import type { RelationshipContext } from '../relationship/context';

export type InteractionModality = 'text' | 'voice_message' | 'live_call' | 'proactive';

export interface PersonaContext {
  companionId: string;
  name: string;
  identity: string;
  personality: string;
  language: string;
  aiConfig?: Companion['aiConfig'];
}

export interface InteractionEnvelope {
  userId: string;
  companionId: string;
  conversationId: string;
  modality: InteractionModality;
  userMessage: string;
  conversationContext: Message[];
  relationshipContext?: RelationshipContext;
  personaContext: PersonaContext;
  memoryContext: Companion['memories'];
  attachments: Attachment[];
  groupContext?: Group;
  mentions?: MessageMention[];
  metadata?: Record<string, unknown>;
  requestId?: string;
}

export interface BrainRequest extends InteractionEnvelope {
  companion: Companion;
  providerStatus: import('../types').AIProviderStatus;
  mode: import('../ai/types').AIConversationMode;
  attachedContext?: CompanionAIContext;
}
