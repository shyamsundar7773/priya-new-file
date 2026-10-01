import type { Companion, Group, Message, MessageMention } from '../types';
import type { AIConversationMode, AIRequest } from './types';
import { relationshipContext } from '../relationship/engine';
import { buildRelationshipContext } from '../relationship/context';
import { buildCompanionAIContext } from './attachmentContext';
import { buildGroupAIContext } from '../groups/context';
import type { Attachment } from '../attachments/model';
import { buildPersonaContext, normalizeInteractionModality } from '../brain/context';

export function buildAIRequest(
  companion: Companion,
  history: Message[],
  userMessage: string,
  providerStatus: AIRequest['providerStatus'],
  mode: AIConversationMode = 'chat',
  groupId?: string,
  groupMessages: Message[] = [],
  mentions: MessageMention[] = [],
  userId?: string,
  group?: Group,
  groupCompanions: Companion[] = [],
  attachments: Attachment[] = [],
  requestId?: string,
  modality?: string,
): AIRequest {
  const languageParts = companion.language.split('&').map((value) => value.trim());
  const aiConfig = companion.aiConfig || {
    personality: { warmth: 75, playfulness: 55, depth: 80, formality: 25 },
    language: { primary: languageParts[0] || 'English', secondary: languageParts[1], codeSwitching: languageParts.length > 1 },
    voice: { style: 'Warm & Natural', pace: 50, warmth: 80 },
    channels: { chat: true, voice: false, call: false, receipts: true },
  };
  const attachedContext = buildCompanionAIContext({
    companion,
    history,
    userMessage,
    mode,
    userId,
    groupId,
    groupMessages,
    attachments,
  });
  const groupContext = mode === 'group' && group ? buildGroupAIContext({
    group,
    companions: groupCompanions,
    messages: groupMessages,
    userMessage,
    targetCompanionId: mentions[0]?.memberId,
  }) : undefined;
  const personaContext = buildPersonaContext(companion);
  const relationshipBoundary = buildRelationshipContext(companion.relationshipState, mode === 'group');
  const effectiveModality = normalizeInteractionModality(modality || (mode === 'call' ? 'live_call' : mode === 'voice' ? 'voice_message' : 'text'));
  const conversationId = groupId ? (group?.conversationId || groupId) : companion.id;
  const envelope = {
    userId: userId || '',
    companionId: companion.id,
    conversationId,
    modality: effectiveModality,
    userMessage,
    conversationContext: (mode === 'group' ? groupMessages : history).slice(-20),
    relationshipContext: relationshipBoundary,
    personaContext,
    memoryContext: attachedContext.memories,
    attachments,
    groupContext: group,
    mentions,
    metadata: mode === 'group' && groupId ? { groupId } : undefined,
    requestId,
  };
  return {
    requestId,
    interaction: envelope,
    personaContext,
    relationshipBoundary,
    userMessage,
    history: (mode === 'group' ? groupMessages : history).slice(-20),
    companion: { ...companion, aiConfig, memories: attachedContext.memories },
    mode,
    groupId,
    groupMessages: groupMessages.slice(-20),
    mentions,
    memoryContext: attachedContext.memories,
    relationshipContext: attachedContext.relationship ? relationshipContext(companion.relationshipState) : undefined,
    providerStatus,
    attachedContext,
    groupContext,
    attachments,
  };
}
