import { buildCompanionAIContext } from '../ai/attachmentContext';
import { createAttachment, toAttachmentContext } from '../attachments/model';
import { COMPANIONS } from '../data';
import { userStorageKeys } from '../storage/keys';
import type { Companion, Message } from '../types';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Stage 15 security contract failed: ${message}`);
}

export function runStage15SecurityContractTests(): void {
  const accountA = 'account-a';
  const accountB = 'account-b';
  const priya: Companion = { ...COMPANIONS[0], memories: [] };
  const accountAMemory = {
    id: 'account-a-memory',
    userId: accountA,
    companionId: priya.id,
    scope: 'companion' as const,
    text: 'Account A private fact',
    source: 'user' as const,
    status: 'accepted' as const,
  };
  const accountAAttachment = createAttachment({
    id: 'account-a-image',
    uri: 'file:///private/account-a.jpg',
    mimeType: 'image/jpeg',
    userId: accountA,
    companionId: priya.id,
  });
  const message: Message = {
    id: 'account-a-message',
    fromMe: true,
    type: 'text',
    text: 'private',
    attachments: [accountAAttachment],
    status: 'delivered',
    timestamp: new Date(),
  };
  const accountAContext = buildCompanionAIContext({
    companion: { ...priya, memories: [accountAMemory] },
    history: [message],
    userMessage: 'private',
    userId: accountA,
    attachments: [accountAAttachment],
  });
  const accountBContext = buildCompanionAIContext({
    companion: { ...priya, memories: [accountAMemory] },
    history: [message],
    userMessage: 'private',
    userId: accountB,
    attachments: [accountAAttachment],
  });
  assert(accountAContext.memories.length === 1, 'authenticated account retains its own memory');
  assert(accountBContext.memories.length === 0, 'account B cannot hydrate account A memory');
  assert(accountAContext.attachments.length === 1, 'authenticated account retains its own attachment context');
  assert(toAttachmentContext([accountAAttachment], accountB, priya.id).length === 0, 'account B cannot access account A attachments');
  assert(!JSON.stringify(accountAContext.attachments).includes('file:///'), 'local media paths are excluded from provider context');
  assert(userStorageKeys(accountA).conversations !== userStorageKeys(accountB).conversations, 'account storage namespaces differ');
  assert(userStorageKeys(accountA).preferences !== userStorageKeys(accountB).preferences, 'account preferences namespaces differ');
  assert(!JSON.stringify(accountAContext).includes('access_token'), 'access tokens are excluded from AI context');
  assert(!JSON.stringify(accountAContext).includes('apiKey'), 'provider keys are excluded from AI context');
}
