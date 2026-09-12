import test from 'node:test';
import assert from 'node:assert/strict';
import { createFixtureCache, fixtureCacheTtl } from './fixtureCache.js';

const fixture = (status, date = '2026-09-11T20:00:00.000Z') => ({ fixture: { id: 1, date, status: { short: status } } });

test('uses adaptive TTL for future, live and finished fixtures', () => {
  const now = Date.parse('2026-09-11T10:00:00.000Z');
  assert.equal(fixtureCacheTtl([fixture('NS')], now), 60 * 60_000);
  assert.equal(fixtureCacheTtl([fixture('NS', '2026-09-11T12:30:00.000Z')], now), 30 * 60_000);
  assert.equal(fixtureCacheTtl([fixture('NS', '2026-09-11T10:10:00.000Z')], now), 5 * 60_000);
  assert.equal(fixtureCacheTtl([fixture('2H')], now), 5 * 60_000);
  assert.equal(fixtureCacheTtl([fixture('FT')], now), 6 * 60 * 60_000);
});

test('repeated and concurrent reads share one upstream request', async () => {
  let calls = 0;
  let clock = Date.parse('2026-09-11T19:59:00.000Z');
  const cache = createFixtureCache({ now: () => clock, loader: async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return { data: [fixture('1H')], quota: { remaining: '99', limit: '100' } };
  } });
  const [first, second] = await Promise.all([cache.get('today'), cache.get('today')]);
  assert.equal(calls, 1);
  assert.deepEqual(new Set([first.source, second.source]), new Set(['api', 'shared']));
  clock += 60_000;
  assert.equal((await cache.get('today')).source, 'cache');
  assert.equal(calls, 1);
});

test('browser reads protect remaining quota while task reads may use the reserve', async () => {
  let calls = 0;
  let clock = Date.parse('2026-09-11T10:00:00.000Z');
  const initial = { today: { data: [fixture('1H')], quota: { remaining: '10', limit: '100' }, fetchedAt: new Date(clock - 10 * 60_000).toISOString() } };
  const cache = createFixtureCache({ initial, now: () => clock, loader: async () => {
    calls += 1;
    return { data: [fixture('2H')], quota: { remaining: '9', limit: '100' } };
  } });
  const browser = await cache.get('today', { protectQuota: true, quotaReserve: 10 });
  assert.equal(browser.quotaProtected, true);
  assert.equal(calls, 0);
  assert.equal((await cache.get('today')).source, 'api');
  assert.equal(calls, 1);
});

test('unknown provider quota does not freeze an expired cache entry', async () => {
  let calls = 0;
  const clock = Date.parse('2026-09-11T20:00:00.000Z');
  const initial = { stats: { data: [fixture('1H')], quota: { remaining: null, limit: null }, fetchedAt: new Date(clock - 10 * 60_000).toISOString() } };
  const cache = createFixtureCache({ initial, now: () => clock, loader: async () => {
    calls += 1;
    return { data: [fixture('2H')], quota: { remaining: null, limit: null } };
  } });
  assert.equal((await cache.get('stats', { protectQuota: true })).source, 'api');
  assert.equal(calls, 1);
});

test('stale browser fallback is returned after an upstream failure', async () => {
  const clock = Date.parse('2026-09-11T20:00:00.000Z');
  const initial = { today: { data: [fixture('1H')], fetchedAt: new Date(clock - 10 * 60_000).toISOString() } };
  const cache = createFixtureCache({ initial, now: () => clock, loader: async () => { throw new Error('offline'); } });
  const result = await cache.get('today', { allowStale: true });
  assert.equal(result.source, 'stale');
  assert.equal(result.stale, true);
  await assert.rejects(cache.get('today'), /offline/);
});

test('peek restores stale or fresh cache without calling the upstream loader', () => {
  let calls = 0;
  const clock = Date.parse('2026-09-11T20:00:00.000Z');
  const initial = {
    fresh: { data: [fixture('1H')], fetchedAt: new Date(clock - 60_000).toISOString() },
    stale: { data: [fixture('1H')], fetchedAt: new Date(clock - 10 * 60_000).toISOString() },
  };
  const cache = createFixtureCache({ initial, now: () => clock, loader: async () => { calls += 1; return { data: [] }; } });
  assert.equal(cache.peek('fresh').stale, false);
  assert.equal(cache.peek('stale').stale, true);
  assert.equal(cache.peek('missing'), null);
  assert.equal(calls, 0);
});

test('different API key cache entries remain independent', async () => {
  let calls = 0;
  const cache = createFixtureCache({ loader: async (key) => {
    calls += 1;
    return { data: [{ fixture: { id: key.startsWith('key-a|') ? 101 : 202 } }] };
  } });
  const firstKey = 'key-a|api-football|2026-09-12|Asia/Shanghai';
  const secondKey = 'key-b|api-football|2026-09-12|Asia/Shanghai';

  await cache.get(firstKey);
  await cache.get(secondKey);

  assert.equal(calls, 2);
  assert.equal(cache.peek(firstKey).data[0].fixture.id, 101);
  assert.equal(cache.peek(secondKey).data[0].fixture.id, 202);
  assert.deepEqual(Object.keys(cache.snapshot()).sort(), [firstKey, secondKey].sort());
});
