import type { Message } from '../types';
import type { InteractionModality } from '../brain/types';

export interface ArchiveMessage {
  userId: string;
  companionId: string;
  conversationId: string;
  messageId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  modality: InteractionModality;
  occurredAt: string;
  metadata: Record<string, unknown>;
}

export interface ConversationArchive {
  appendMessage(message: ArchiveMessage): Promise<void>;
}

export function archiveRecordFromMessage(input: {
  userId: string;
  companionId: string;
  conversationId: string;
  message: Message;
  extraMetadata?: Record<string, unknown>;
}): ArchiveMessage {
  const { userId, companionId, conversationId, message } = input;
  const modality: InteractionModality = message.proactiveEventId
    ? 'proactive'
    : message.type === 'call'
      ? 'live_call'
      : message.type === 'voice'
        ? 'voice_message'
        : 'text';
  const attachments = message.attachments?.map(({ id, kind, mimeType, fileName, size, caption }) => ({
    id, kind, mimeType, fileName, size, caption,
  }));
  return {
    userId,
    companionId,
    conversationId,
    messageId: message.id,
    role: message.fromMe ? 'user' : 'assistant',
    content: message.text || '',
    modality,
    occurredAt: message.timestamp.toISOString(),
    metadata: {
      messageType: message.type,
      status: message.status,
      interactionId: message.id,
      ...(message.replyToId ? { replyToId: message.replyToId } : {}),
      ...(message.replyToText ? { replyToText: message.replyToText } : {}),
      ...(message.replyToAuthor ? { replyToAuthor: message.replyToAuthor } : {}),
      ...(message.voiceDuration === undefined ? {} : { voiceDuration: message.voiceDuration }),
      ...(message.voiceTranscription === undefined ? {} : { voiceTranscription: message.voiceTranscription }),
      ...(message.proactiveEventId ? { proactiveEventId: message.proactiveEventId } : {}),
      ...(message.callId ? { callId: message.callId } : {}),
      ...(message.callOutcome ? { callOutcome: message.callOutcome } : {}),
      ...(message.callDuration === undefined ? {} : { callDuration: message.callDuration }),
      ...(message.callStartedAt ? { callStartedAt: message.callStartedAt } : {}),
      ...(message.callEndedAt ? { callEndedAt: message.callEndedAt } : {}),
      ...(message.callFailureReason ? { callFailureReason: message.callFailureReason } : {}),
      ...(attachments?.length ? { attachments } : {}),
      ...(input.extraMetadata || {}),
    },
  };
}
