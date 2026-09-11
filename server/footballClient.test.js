import test from 'node:test';
import assert from 'node:assert/strict';
import { createFootballClient, networkError, retryDelay } from './footballClient.js';

const client = (fetchImpl) => createFootballClient({ apiKey: 'test-key', fetchImpl, dispatcher: {} });

test('sends date, key and abort signal; preserves fixtures and quota', async () => {
  let tracked = 0;
  const request = createFootballClient({ apiKey: 'test-key', dispatcher: {}, onRequest: () => { tracked += 1; }, fetchImpl: async (url, options) => {
    assert.equal(url.searchParams.get('date'), '2026-09-11');
    assert.equal(options.headers['x-apisports-key'], 'test-key');
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json({ response: [{ fixture: { id: 1 } }], errors: [] }, { headers: { 'x-ratelimit-requests-remaining': '42' } });
  } });
  const result = await request('fixtures', { date: '2026-09-11' });
  assert.equal(result.data[0].fixture.id, 1);
  assert.equal(result.quota.remaining, '42');
  assert.equal(tracked, 1);
});

for (const [status, code] of [[401, 'AUTH'], [403, 'AUTH'], [429, 'RATE_LIMIT'], [502, 'UPSTREAM']]) {
  test(`HTTP ${status} handles non-JSON errors without leaking response body`, async () => {
    await assert.rejects(client(async () => new Response('secret test-key', { status, headers: { 'retry-after': '120' } }))('fixtures'), error => {
      assert.equal(error.code, code);
      assert.ok(!error.message.includes('test-key'));
      if (status === 429) assert.equal(error.retryAfterMs, 120_000);
      return true;
    });
  });
}

for (const body of ['<html>bad gateway</html>', '{}', 'null', '{"response":{}}']) {
  test(`rejects malformed payload ${body}`, async () => {
    await assert.rejects(client(async () => new Response(body))('fixtures'), { code: body === 'null' ? 'API_ERROR' : 'INVALID_RESPONSE' });
  });
}

test('HTTP 200 provider errors are failures, not empty fixture results', async () => {
  await assert.rejects(client(async () => Response.json({ errors: { token: 'private value' }, response: [] }))('fixtures'), { code: 'API_ERROR' });
});

test('classifies nested DNS, timeout and certificate errors', () => {
  for (const [code, expected] of [['EAI_AGAIN', 'DNS'], ['UND_ERR_CONNECT_TIMEOUT', 'TIMEOUT'], ['CERT_HAS_EXPIRED', 'TLS'], ['ECONNRESET', 'NETWORK']]) {
    assert.equal(networkError(new TypeError('fetch failed', { cause: { code } })).code, expected);
  }
  assert.equal(networkError({ cause: { errors: [{ code: 'ETIMEDOUT' }] } }).code, 'TIMEOUT');
});

test('timeout covers response body as well as connection', async () => {
  const keepAlive = setTimeout(() => {}, 500);
  try {
    const request = createFootballClient({ apiKey: 'test', timeoutMs: 10, dispatcher: {}, fetchImpl: async (_url, { signal }) => ({
      ok: true, status: 200,
      json: () => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })),
    }) });
    await assert.rejects(request('fixtures'), { code: 'TIMEOUT' });
  } finally { clearTimeout(keepAlive); }
});

test('failure does not poison subsequent request', async () => {
  let attempts = 0;
  const request = client(async () => {
    if (!attempts++) throw new TypeError('fetch failed');
    return Response.json({ response: [], errors: [] });
  });
  await assert.rejects(request('fixtures'), { code: 'NETWORK' });
  assert.deepEqual((await request('fixtures')).data, []);
});

test('backoff grows, caps at 30 minutes and respects configured frequency and Retry-After', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(n => retryDelay(1, n) / 60_000), [3, 6, 12, 24, 30, 30]);
  assert.equal(retryDelay(60, 6), 60 * 60_000);
  assert.equal(retryDelay(1, 1, 3600_000), 3600_000);
});
