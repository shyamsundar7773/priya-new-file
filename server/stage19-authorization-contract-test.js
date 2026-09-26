const assert = require('node:assert/strict');
const { bindAuthenticatedIdentity, publicError, originAllowed } = require('./security');
const { authorizeLiveStartMessage, validateLiveStartMessage } = require('./liveProxy');
const { classifyProviderError, isRetryableFailure, sanitizedProviderError } = require('./providers/reliability');

const owner = 'stage19-owner';
const foreign = 'stage19-foreign';

assert.equal(bindAuthenticatedIdentity({ companion: { id: 'c1', ownerUserId: owner } }, owner).authenticatedUserId, owner);
assert.throws(() => bindAuthenticatedIdentity({ companion: { id: 'c1', ownerUserId: foreign } }, owner), /authorization/i);
assert.throws(() => bindAuthenticatedIdentity({ attachedContext: { user: { id: foreign } } }, owner), /authorization/i);
assert.throws(() => bindAuthenticatedIdentity({ groupContext: { group: { id: 'g1', userId: foreign } } }, owner), /authorization/i);
assert.equal(publicError(Object.assign(new Error('foreign resource details'), { code: 'AUTHORIZATION' })).status, 403);

const validLive = {
  type: 'start',
  context: {
    userId: owner,
    companion: { id: 'c1', name: 'Priya' },
    systemInstruction: 'You are Priya.',
  },
};
assert.equal(validateLiveStartMessage(validLive), null);
assert.equal(authorizeLiveStartMessage(validLive, { id: owner }), null);
assert.equal(authorizeLiveStartMessage(validLive, { id: foreign }), 'Resource authorization failed.');
assert.equal(authorizeLiveStartMessage({ ...validLive, context: { ...validLive.context, companion: undefined } }, { id: owner }), 'Selected companion is required.');

assert.equal(originAllowed('http://localhost:8081', ['http://localhost:8081']), true);
assert.equal(originAllowed('https://evil.example', ['http://localhost:8081']), false);
assert.equal(classifyProviderError(Object.assign(new Error('timeout'), { code: 'TIMEOUT' })), 'timeout');
assert.equal(isRetryableFailure(Object.assign(new Error('invalid'), { code: 'INVALID_REQUEST' })), false);
assert.equal(sanitizedProviderError(Object.assign(new Error('secret'), { code: 'AUTHENTICATION' })).message, 'The AI provider is not authenticated.');

console.log('Stage 19 authorization contracts passed.');
