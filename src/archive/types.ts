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
  loadConversationMessages?(conversationId: string, userId?: string): Promise<Message[]>;
  loadUserConversations?(userId?: string): Promise<Record<string, Message[]>>;
}

export function conversationRowToMessage(row: Record<string, unknown>): Message | null {
  if (!row || typeof row !== 'object') return null;
  const id = typeof row.id === 'string' ? row.id : null;
  if (!id) return null;
  const role = typeof row.role === 'string' ? row.role : 'user';
  const modality = typeof row.modality === 'string' ? row.modality : 'text';
  const type: Message['type'] = modality === 'voice_message' ? 'voice' : modality === 'live_call' ? 'call' : 'text';
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata as Record<string, unknown> : {};
  const timestampValue = typeof row.created_at === 'string' ? row.created_at : new Date().toISOString();
  const voiceDuration = typeof metadata.voiceDuration === 'number' ? metadata.voiceDuration : undefined;
  const voiceTranscription = typeof metadata.voiceTranscription === 'string' ? metadata.voiceTranscription : undefined;
  const callOutcome = typeof metadata.callOutcome === 'string' ? metadata.callOutcome as Message['callOutcome'] : undefined;
  const callDuration = typeof metadata.callDuration === 'number' ? metadata.callDuration : undefined;
  const callStartedAt = typeof metadata.callStartedAt === 'string' ? metadata.callStartedAt : undefined;
  const callEndedAt = typeof metadata.callEndedAt === 'string' ? metadata.callEndedAt : undefined;
  const callFailureReason = typeof metadata.callFailureReason === 'string' ? metadata.callFailureReason : undefined;
  const attachments = Array.isArray(metadata.attachments) ? metadata.attachments as Message['attachments'] : undefined;
  const isVoice = type === 'voice';
  const text = typeof row.content === 'string' ? row.content : '';

  return {
    id,
    fromMe: role === 'user',
    type,
    text: isVoice ? text : text,
    status: 'delivered',
    timestamp: new Date(timestampValue),
    voiceDuration,
    voiceTranscription,
    callId: typeof metadata.callId === 'string' ? metadata.callId : undefined,
    callDuration,
    callStartedAt,
    callEndedAt,
    callOutcome,
    callFailureReason,
    callProvider: typeof metadata.callProvider === 'string' ? metadata.callProvider as Message['callProvider'] : undefined,
    callUserId: typeof metadata.callUserId === 'string' ? metadata.callUserId : undefined,
    callCompanionId: typeof metadata.callCompanionId === 'string' ? metadata.callCompanionId : undefined,
    attachments,
    replyToId: typeof metadata.replyToId === 'string' ? metadata.replyToId : undefined,
    replyToText: typeof metadata.replyToText === 'string' ? metadata.replyToText : undefined,
    replyToAuthor: typeof metadata.replyToAuthor === 'string' ? metadata.replyToAuthor : undefined,
    proactiveEventId: typeof metadata.proactiveEventId === 'string' ? metadata.proactiveEventId : undefined,
    groupId: typeof metadata.groupId === 'string' ? metadata.groupId : undefined,
    responseTargetId: typeof metadata.responseTargetId === 'string' ? metadata.responseTargetId : undefined,
  };
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
