import type { SupabaseClient } from '@supabase/supabase-js';
import type { ArchiveMessage, ConversationArchive } from './types';

export class SupabaseConversationArchive implements ConversationArchive {
  constructor(private readonly client: SupabaseClient) {}

  async appendMessage(message: ArchiveMessage): Promise<void> {
    const { data, error: authError } = await this.client.auth.getUser();
    if (authError || !data.user) throw new Error('An authenticated user is required to archive a conversation.');
    if (data.user.id !== message.userId) throw new Error('Archive ownership does not match the authenticated user.');

    const { error: conversationError } = await this.client.from('conversations').upsert({
      id: message.conversationId,
      user_id: data.user.id,
      companion_id: message.companionId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,id' });
    if (conversationError) throw conversationError;

    const { error: messageError } = await this.client.from('messages').upsert({
      id: message.messageId,
      conversation_id: message.conversationId,
      user_id: data.user.id,
      companion_id: message.companionId,
      role: message.role,
      content: message.content,
      modality: message.modality,
      created_at: message.occurredAt,
      metadata: message.metadata,
    }, { onConflict: 'user_id,id' });
    if (messageError) throw messageError;
  }
}
