import { supabase } from '../auth/supabase';
import { SupabaseConversationArchive } from './supabaseArchive';
import type { ConversationArchive } from './types';

export type { ArchiveMessage, ConversationArchive } from './types';
export { archiveRecordFromMessage } from './types';
export { appendArchiveSafely } from './failureIsolation';

export const conversationArchive: ConversationArchive | undefined = supabase
  ? new SupabaseConversationArchive(supabase)
  : undefined;
