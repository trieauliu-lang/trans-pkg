import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviderClient, normalizeTheStatsMatch } from './providers.js';

test('normalizes TheStatsAPI fixture variants to the shared format', () => {
  const fixture = normalizeTheStatsMatch({
    id: 'mt_1', utc_date: '2026-09-11T15:00:00Z', status: 'live', minute: 67,
    competition_id: 'comp_1', competition: 'Premier League', country: 'England',
    home_team: { id: 'tm_1', name: 'Home', score: 2 }, away_team: { id: 'tm_2', name: 'Away', score: 1 },
  });
  assert.equal(fixture.provider, 'the-stats-api');
  assert.equal(fixture.fixture.status.short, '2H');
  assert.deepEqual(fixture.goals, { home: 2, away: 1 });
  assert.equal(fixture.league.name, 'Premier League');
});

test('TheStatsAPI uses bearer auth, date filters and pagination', async () => {
  const calls = [];
  const client = createProviderClient({ providerId: 'the-stats-api', apiKey: 'stats-key', dispatcher: {}, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    const page = Number(url.searchParams.get('page'));
    return Response.json({
      data: [{ id: `mt_${page}`, utc_date: '2026-09-11T15:00:00Z', status: 'scheduled', home: { name: 'A' }, away: { name: 'B' } }],
      meta: { total_pages: 2 },
    });
  } });
  const result = await client.fetchFixtures('2026-09-11');
  assert.equal(result.data.length, 2);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer stats-key');
  assert.equal(calls[0].url.searchParams.get('date_from'), '2026-09-11');
  assert.equal(calls[0].url.searchParams.get('date_to'), '2026-09-11');
  assert.equal(calls[0].url.searchParams.get('per_page'), '100');
});

test('TheStatsAPI authentication failures are classified', async () => {
  const client = createProviderClient({ providerId: 'the-stats-api', apiKey: 'bad', dispatcher: {}, fetchImpl: async () => new Response('', { status: 401 }) });
  await assert.rejects(client.test(), { code: 'AUTH' });
});
