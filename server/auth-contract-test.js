const assert = require('node:assert/strict');

function authBoundary(headers, supabaseUrl) {
  const authorization = headers.authorization || '';
  return Boolean(supabaseUrl && authorization.startsWith('Bearer ') && authorization.slice(7).trim());
}

assert.equal(authBoundary({}, 'https://example.supabase.co'), false);
assert.equal(authBoundary({ authorization: 'Basic secret' }, 'https://example.supabase.co'), false);
assert.equal(authBoundary({ authorization: 'Bearer token' }, ''), false);
assert.equal(authBoundary({ authorization: 'Bearer token' }, 'https://example.supabase.co'), true);
console.log('Stage 8 backend auth boundary contracts passed.');
