const assert = require('node:assert/strict');
const { bindAuthenticatedIdentity, publicError } = require('./security');

assert.throws(() => bindAuthenticatedIdentity({
  attachedContext: { user: { id: 'spoofed' }, memories: [{ id: 'memory-a' }] },
  authenticatedUserId: 'spoofed',
  relationshipContext: { events: [{ id: 'private-event' }] },
}, 'account-a'), /authorization/i);
const bound = bindAuthenticatedIdentity({
  attachedContext: { user: { id: 'account-a' }, memories: [{ id: 'memory-a' }] },
  relationshipContext: { events: [{ id: 'private-event' }] },
}, 'account-a');
assert.equal(bound.authenticatedUserId, 'account-a');
assert.equal(bound.attachedContext.user.id, 'account-a');
assert.equal(bound.attachedContext.memories[0].id, 'memory-a');
assert.equal(bound.relationshipContext, undefined);
assert.equal(publicError(Object.assign(new Error('bad token'), { code: 'AUTHENTICATION' })).status, 401);
assert.equal(publicError(new Error('provider leaked detail')).message, 'The AI provider request failed.');
console.log('Stage 15 server security contracts passed.');
