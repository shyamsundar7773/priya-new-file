function bindAuthenticatedIdentity(request, userId) {
  const assertMatchingUser = (value, allowDirectId = false) => {
    if (!value || typeof value !== 'object') return;
    const claimedUserId = value.userId || value.ownerUserId || value.user?.id || (allowDirectId ? value.id : undefined);
    if (typeof claimedUserId === 'string' && claimedUserId !== userId) {
      throw Object.assign(new Error('Resource authorization failed.'), { code: 'AUTHORIZATION' });
    }
  };
  assertMatchingUser(request);
  assertMatchingUser(request?.companion);
  assertMatchingUser(request?.groupContext?.group);
  assertMatchingUser(request?.attachedContext?.user, true);
  for (const memory of request?.attachedContext?.memories || []) assertMatchingUser(memory);
  for (const attachment of request?.attachedContext?.attachments || []) assertMatchingUser(attachment);
  for (const participant of request?.groupContext?.participants || []) assertMatchingUser(participant);
  const attachedContext = request && request.attachedContext && typeof request.attachedContext === 'object'
    ? { ...request.attachedContext, user: { id: userId } }
    : request?.attachedContext;
  return {
    ...request,
    authenticatedUserId: userId,
    relationshipContext: undefined,
    userId,
    attachedContext,
  };
}

function publicError(error) {
  if (error?.code === 'AUTHENTICATION') return { status: 401, code: 'AUTHENTICATION', message: 'Authentication is required.' };
  if (error?.code === 'AUTHORIZATION') return { status: 403, code: 'AUTHORIZATION', message: 'Resource authorization failed.' };
  if (error?.code === 'PROVIDER_NOT_CONFIGURED') return { status: 503, code: 'PROVIDER_NOT_CONFIGURED', message: 'No AI provider is configured.' };
  if (error?.code === 'STT_UNAVAILABLE') return { status: 503, code: 'VOICE_STT_PROVIDER_NOT_CONFIGURED', message: 'Voice transcription provider is not configured.' };
  if (error?.code === 'TTS_UNAVAILABLE') return { status: 503, code: 'VOICE_TTS_PROVIDER_NOT_CONFIGURED', message: 'Voice audio provider is not configured.' };
  if (error?.code === 'TTS_TERMS_REQUIRED') return { status: 503, code: 'VOICE_TTS_TERMS_REQUIRED', message: 'The configured voice provider requires model terms acceptance.' };
  if (error?.code === 'INVALID_AUDIO') return { status: 400, code: 'VOICE_STT_BAD_AUDIO', message: 'The recorded audio format is not supported.' };
  if (error?.code === 'UNAVAILABLE') return { status: 503, code: 'UNAVAILABLE', message: 'The AI service is unavailable.' };
  if (error?.message === 'Malformed JSON request.') return { status: 400, code: 'INVALID_REQUEST', message: error.message };
  return { status: 502, code: 'PROVIDER_FAILURE', message: 'The AI provider request failed.' };
}

function originAllowed(origin, allowedOrigins) {
  if (!origin) return true;
  return allowedOrigins.includes(origin);
}

module.exports = { bindAuthenticatedIdentity, publicError, originAllowed };
