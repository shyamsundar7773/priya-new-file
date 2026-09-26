const assert = require('node:assert/strict');

(async () => {
  const { startServer } = require('./index');
  const server = startServer({ port: 0, host: '127.0.0.1' });

  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  try {
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const baseUrl = `http://127.0.0.1:${address.port}`;
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);

    const body = await response.json();
    assert.deepEqual(body, { status: 'ok' });

    const chatResponse = await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userMessage: 'hello', companion: { name: 'Priya' } }),
    });
    assert.equal(chatResponse.status, 401);
    assert.deepEqual(await chatResponse.json(), {
      error: 'Authentication is required.',
      code: 'AUTHENTICATION',
    });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  console.log('Health and authenticated-chat smoke tests passed.');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
