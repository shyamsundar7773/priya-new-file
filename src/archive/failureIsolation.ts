import type { ArchiveMessage, ConversationArchive } from './types';

export async function appendArchiveSafely(archive: ConversationArchive | undefined, message: ArchiveMessage): Promise<boolean> {
  if (!archive) return false;
  try {
    await archive.appendMessage(message);
    return true;
  } catch (error: unknown) {
    console.warn(`[conversation-archive] write_failed conversationId=${message.conversationId} messageId=${message.messageId} errorName=${error instanceof Error ? error.name : 'UnknownError'}`);
    return false;
  }
}
