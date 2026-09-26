export type AttachmentKind = 'image' | 'camera-image' | 'file' | 'audio';
export type AttachmentLifecycle = 'selected' | 'pending' | 'sent' | 'failed' | 'missing' | 'deleted';
export type AttachmentProcessingState = 'idle' | 'processing' | 'ready' | 'failed';

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENT_CONTEXT_ITEMS = 4;

export interface Attachment {
  id: string;
  messageId?: string;
  userId?: string;
  companionId?: string;
  groupId?: string;
  kind: AttachmentKind;
  mimeType: string;
  fileName?: string;
  size?: number;
  localUri?: string;
  createdAt: string;
  lifecycle: AttachmentLifecycle;
  processing: AttachmentProcessingState;
  missing?: boolean;
  caption?: string;
}

export interface AttachmentAssetInput {
  id?: string;
  uri: string;
  mimeType?: string;
  fileName?: string;
  fileSize?: number;
  kind?: 'image' | 'camera-image' | 'file';
  messageId?: string;
  userId?: string;
  companionId?: string;
  groupId?: string;
  caption?: string;
}

export interface AttachmentValidation {
  valid: boolean;
  error?: 'MISSING_URI' | 'UNSUPPORTED_MIME' | 'OVERSIZED' | 'INVALID_SIZE' | 'MISSING_SCOPE';
}

const SUPPORTED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'application/pdf',
  'text/plain',
  'audio/m4a',
  'audio/wav',
  'audio/mpeg',
]);

function stableHash(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  return Math.abs(hash).toString(36);
}

export function createAttachmentId(input: Pick<AttachmentAssetInput, 'uri' | 'fileName' | 'kind'>, salt = Date.now()): string {
  return `attachment-${stableHash(`${input.kind || 'file'}:${input.uri}:${input.fileName || ''}:${salt}`)}`;
}

export function validateAttachmentInput(input: AttachmentAssetInput): AttachmentValidation {
  if (!input.uri.trim()) return { valid: false, error: 'MISSING_URI' };
  const mimeType = input.mimeType?.toLowerCase();
  if (!mimeType || !SUPPORTED_MIME_TYPES.has(mimeType)) return { valid: false, error: 'UNSUPPORTED_MIME' };
  if (input.fileSize !== undefined && (!Number.isFinite(input.fileSize) || input.fileSize < 0)) return { valid: false, error: 'INVALID_SIZE' };
  if (input.fileSize !== undefined && input.fileSize > MAX_ATTACHMENT_BYTES) return { valid: false, error: 'OVERSIZED' };
  if (!input.userId && !input.companionId && !input.groupId) return { valid: false, error: 'MISSING_SCOPE' };
  return { valid: true };
}

export function createAttachment(input: AttachmentAssetInput, salt?: number): Attachment {
  const validation = validateAttachmentInput(input);
  if (!validation.valid) throw new Error(`Attachment rejected: ${validation.error}`);
  return {
    id: input.id || createAttachmentId(input, salt),
    messageId: input.messageId,
    userId: input.userId,
    companionId: input.companionId,
    groupId: input.groupId,
    kind: input.kind || (input.mimeType?.startsWith('image/') ? 'image' : 'file'),
    mimeType: input.mimeType!.toLowerCase(),
    fileName: input.fileName,
    size: input.fileSize,
    localUri: input.uri,
    createdAt: new Date().toISOString(),
    lifecycle: 'selected',
    processing: 'idle',
    missing: false,
    caption: input.caption,
  };
}

export function markAttachmentState(attachment: Attachment, lifecycle: AttachmentLifecycle, processing = attachment.processing): Attachment {
  return { ...attachment, lifecycle, processing, missing: lifecycle === 'missing' || attachment.missing };
}

export function normalizeAttachment(value: unknown): Attachment | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const item = value as Partial<Attachment>;
  if (typeof item.id !== 'string' || typeof item.kind !== 'string' || typeof item.mimeType !== 'string') return undefined;
  const lifecycle: AttachmentLifecycle = ['selected', 'pending', 'sent', 'failed', 'missing', 'deleted'].includes(item.lifecycle || '') ? item.lifecycle as AttachmentLifecycle : 'missing';
  return {
    id: item.id,
    messageId: typeof item.messageId === 'string' ? item.messageId : undefined,
    userId: typeof item.userId === 'string' ? item.userId : undefined,
    companionId: typeof item.companionId === 'string' ? item.companionId : undefined,
    groupId: typeof item.groupId === 'string' ? item.groupId : undefined,
    kind: item.kind as AttachmentKind,
    mimeType: item.mimeType,
    fileName: typeof item.fileName === 'string' ? item.fileName : undefined,
    size: typeof item.size === 'number' ? item.size : undefined,
    localUri: typeof item.localUri === 'string' ? item.localUri : undefined,
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date(0).toISOString(),
    lifecycle: !item.localUri && lifecycle !== 'deleted' ? 'missing' : lifecycle,
    processing: ['idle', 'processing', 'ready', 'failed'].includes(item.processing || '') ? item.processing as AttachmentProcessingState : 'failed',
    missing: Boolean(item.missing) || (!item.localUri && lifecycle !== 'deleted'),
    caption: typeof item.caption === 'string' ? item.caption.slice(0, 500) : undefined,
  };
}

export function toAttachmentContext(attachments: Attachment[], userId?: string, companionId?: string, groupId?: string) {
  return attachments
    .filter((attachment) =>
      attachment.lifecycle !== 'deleted' &&
      (!userId || !attachment.userId || attachment.userId === userId) &&
      (!companionId || (attachment.companionId === companionId && !attachment.groupId)) &&
      (!groupId || attachment.groupId === groupId),
    )
    .slice(-MAX_ATTACHMENT_CONTEXT_ITEMS)
    .map(({ id, kind, mimeType, fileName, size, lifecycle, processing, missing, caption }) => ({
      id, kind, mimeType, fileName, size, lifecycle, processing, missing: Boolean(missing), caption,
    }));
}

export function canCleanupAttachment(attachment: Attachment, referencedByMessageIds: string[]): boolean {
  return !attachment.messageId || referencedByMessageIds.filter((id) => id === attachment.messageId).length <= 1;
}
