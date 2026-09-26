import { buildCompanionAIContext } from '../ai/attachmentContext';
import { createAttachment, markAttachmentState, normalizeAttachment, toAttachmentContext, validateAttachmentInput } from '../attachments/model';
import { buildGroupAIContext } from '../groups/context';
import { hydrateMessages } from '../storage/serialize';
import type { Companion, Group, Message } from '../types';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Stage 14 attachment contract failed: ${message}`);
}

function image(id: string, userId: string, companionId?: string, groupId?: string) {
  return createAttachment({
    id,
    uri: `file:///cache/${id}.jpg`,
    mimeType: 'image/jpeg',
    fileName: `${id}.jpg`,
    fileSize: 1024,
    kind: 'image',
    userId,
    companionId,
    groupId,
  }, 1);
}

export function runStage14AttachmentContractTests(companion: Companion, secondCompanion: Companion = { ...companion, id: 'latha', name: 'Latha' }): void {
  const userA = 'stage14-user-a';
  const userB = 'stage14-user-b';
  const priyaAttachment = image('priya-image', userA, companion.id);
  const lathaAttachment = image('latha-image', userA, secondCompanion.id);
  const group: Group = { id: 'stage14-group', name: 'Shared', companionIds: [companion.id, secondCompanion.id], unreadCount: 0 };
  const groupAttachment = image('group-image', userA, undefined, group.id);

  assert(validateAttachmentInput({ uri: 'file:///a.jpg', mimeType: 'image/jpeg', userId: userA }).valid, 'valid image metadata is accepted');
  assert(validateAttachmentInput({ uri: 'file:///a.exe', mimeType: 'application/x-msdownload', userId: userA }).error === 'UNSUPPORTED_MIME', 'unsupported MIME is rejected');
  assert(validateAttachmentInput({ uri: 'file:///large.jpg', mimeType: 'image/jpeg', fileSize: 11 * 1024 * 1024, userId: userA }).error === 'OVERSIZED', 'oversized media is rejected');
  assert(validateAttachmentInput({ uri: '', mimeType: 'image/jpeg', userId: userA }).error === 'MISSING_URI', 'missing URI is rejected');
  assert(priyaAttachment.id !== lathaAttachment.id, 'attachment identities are stable and distinct');

  const message: Message = {
    id: 'attachment-message',
    fromMe: true,
    type: 'text',
    text: 'Look at this',
    attachments: [markAttachmentState({ ...priyaAttachment, messageId: 'attachment-message' }, 'sent', 'ready')],
    status: 'delivered',
    timestamp: new Date('2026-09-25T00:00:00.000Z'),
  };
  const hydrated = hydrateMessages(JSON.parse(JSON.stringify([message, message])));
  assert(hydrated.length === 1 && hydrated[0].attachments?.[0]?.id === priyaAttachment.id, 'message and attachment IDs survive duplicate hydration collapse');

  const missing = normalizeAttachment({ ...priyaAttachment, localUri: undefined, lifecycle: 'sent' });
  assert(missing?.lifecycle === 'missing' && missing.missing === true, 'missing media remains representable as metadata');

  const priya = { ...companion, memories: [] };
  const lathaCompanion = { ...secondCompanion, memories: [] };
  const priyaContext = buildCompanionAIContext({
    companion: priya,
    history: [message],
    userMessage: 'What is in the photo?',
    userId: userA,
    attachments: [priyaAttachment, lathaAttachment],
  });
  assert(priyaContext.attachments.length === 1 && priyaContext.attachments[0].id === priyaAttachment.id, 'companion attachment context is isolated');
  assert(!JSON.stringify(priyaContext.attachments).includes('file:///'), 'provider-neutral attachment context excludes local filesystem paths');
  assert(toAttachmentContext([priyaAttachment], userB, companion.id).length === 0, 'account attachment context is isolated');

  const groupContext = buildCompanionAIContext({
    companion: priya,
    history: [message],
    userMessage: 'Group photo',
    userId: userA,
    mode: 'group',
    groupId: group.id,
    groupMessages: [{ ...message, id: 'group-message', groupId: group.id, attachments: [groupAttachment] }],
    attachments: [priyaAttachment, groupAttachment],
  });
  assert(groupContext.attachments.length === 0 && groupContext.memories.length === 0 && !groupContext.relationship, 'private attachment context is excluded from group mode');
  const bounded = toAttachmentContext([priyaAttachment, lathaAttachment, groupAttachment], userA, companion.id);
  assert(bounded.length === 1, 'attachment context is bounded and companion-scoped');
  const groupAI = buildGroupAIContext({ group, companions: [companion, lathaCompanion], messages: [{ ...message, groupId: group.id, attachments: [groupAttachment] }], userMessage: 'Group photo' });
  assert(groupAI.shortTerm[0]?.attachments?.[0]?.groupId === group.id, 'group attachment history remains group-scoped');
  assert(groupAI.shortTerm[0]?.attachments?.[0]?.companionId === undefined, 'group attachment has no private companion scope');
}
