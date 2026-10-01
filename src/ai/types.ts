import type { AIProviderStatus, Companion, Message, MessageMention, RelationshipState } from '../types';
import type { CompanionAIContext } from './attachmentContext';
import type { Attachment } from '../attachments/model';
import type { GroupAIContext } from '../groups/context';
import type { InteractionEnvelope, PersonaContext } from '../brain/types';
import type { RelationshipContext } from '../relationship/context';

export type AIConversationMode = 'chat' | 'voice' | 'call' | 'group';

export interface AIRequest {
  requestId?: string;
  interaction: InteractionEnvelope;
  personaContext: PersonaContext;
  relationshipBoundary?: RelationshipContext;
  userMessage: string;
  history: Message[];
  companion: Companion;
  mode: AIConversationMode;
  groupId?: string;
  groupMessages?: Message[];
  mentions?: MessageMention[];
  memoryContext: Companion['memories'];
  relationshipContext?: RelationshipState;
  providerStatus: AIProviderStatus;
  attachedContext?: CompanionAIContext;
  groupContext?: GroupAIContext;
  attachments?: Attachment[];
}

export interface AIResponse {
  text?: string;
  status: 'success' | 'error' | 'offline' | 'recovering';
  provider: string;
  model?: string;
  error?: {
    code: 'PROVIDER_FAILURE' | 'ENGINE_OFFLINE' | 'ENGINE_RECOVERING' | 'UNAVAILABLE' | 'AUTHENTICATION' | 'MODEL_UNAVAILABLE' | 'TIMEOUT' | 'MALFORMED_RESPONSE';
    message: string;
  };
}

export interface AIProvider {
  readonly id: string;
  readonly name: string;
  generateResponse(request: AIRequest): Promise<AIResponse>;
}
