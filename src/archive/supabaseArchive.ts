import type { SupabaseClient } from '@supabase/supabase-js';
import type { Message } from '../types';
import type { ArchiveMessage, ConversationArchive } from './types';
import { conversationRowToMessage } from './types';

export class SupabaseConversationArchive implements ConversationArchive {
  constructor(private readonly client: SupabaseClient) {}

  private async requireAuthenticatedUser(userId?: string): Promise<string> {
    const { data, error: authError } = await this.client.auth.getUser();
    if (authError || !data.user) throw new Error('An authenticated user is required to archive a conversation.');
    if (userId && data.user.id !== userId) throw new Error('Archive ownership does not match the authenticated user.');
    return data.user.id;
  }

  async appendMessage(message: ArchiveMessage): Promise<void> {
    const authenticatedUserId = await this.requireAuthenticatedUser(message.userId);
    const { error: conversationError } = await this.client.from('conversations').upsert({
      id: message.conversationId,
      user_id: authenticatedUserId,
      companion_id: message.companionId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,id' });
    if (conversationError) throw conversationError;

    const { error: messageError } = await this.client.from('messages').upsert({
      id: message.messageId,
      conversation_id: message.conversationId,
      user_id: authenticatedUserId,
      companion_id: message.companionId,
      role: message.role,
      content: message.content,
      modality: message.modality,
      created_at: message.occurredAt,
      metadata: message.metadata,
    }, { onConflict: 'user_id,id' });
    if (messageError) throw messageError;
  }

  async loadConversationMessages(conversationId: string, userId?: string): Promise<Message[]> {
    const authenticatedUserId = await this.requireAuthenticatedUser(userId);
    const { data, error } = await this.client.from('messages')
      .select('*')
      .eq('user_id', authenticatedUserId)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []).map((row) => conversationRowToMessage(row as Record<string, unknown>)).filter((row): row is Message => Boolean(row));
  }

  async loadUserConversations(userId?: string): Promise<Record<string, Message[]>> {
    const authenticatedUserId = await this.requireAuthenticatedUser(userId);
    const { data, error } = await this.client.from('messages')
      .select('*')
      .eq('user_id', authenticatedUserId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    const grouped: Record<string, Message[]> = {};
    for (const row of data || []) {
      const message = conversationRowToMessage(row as Record<string, unknown>);
      if (!message) continue;
      const conversationId = typeof row.conversation_id === 'string' ? row.conversation_id : 'unknown';
      grouped[conversationId] = [...(grouped[conversationId] || []), message];
    }
    return grouped;
  }
}
