import test from 'node:test';
import assert from 'node:assert/strict';
import { createProviderClient, normalizeTheSportsDbEvent, normalizeTheStatsMatch } from './providers.js';

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

test('normalizes abnormal terminal statuses across providers', () => {
  assert.equal(normalizeTheStatsMatch({ id: 1, date: '2026-09-11', status: 'awarded', home: {}, away: {} }).fixture.status.short, 'AWD');
  assert.equal(normalizeTheSportsDbEvent({ idEvent: 2, dateEvent: '2026-09-11', strStatus: 'Walk Over' }).fixture.status.short, 'WO');
});

test('API-Football tests the account status endpoint and derives daily quota', async () => {
  let requestedUrl;
  const client = createProviderClient({ providerId: 'api-football', apiKey: 'football-key', dispatcher: {}, fetchImpl: async (url) => {
    requestedUrl = url;
    return Response.json({
      errors: [],
      response: { subscription: { active: true }, requests: { current: 8, limit_day: 100 } },
    });
  } });
  const result = await client.test();
  assert.equal(requestedUrl.pathname, '/status');
  assert.deepEqual(result.quota, { limit: '100', remaining: '92' });
});

test('TheStatsAPI uses bearer auth, date filters and pagination', async () => {
  const calls = [];
  let tracked = 0;
  const client = createProviderClient({ providerId: 'the-stats-api', apiKey: 'stats-key', dispatcher: {}, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    const page = Number(url.searchParams.get('page'));
    return Response.json({
      data: [{ id: `mt_${page}`, utc_date: '2026-09-11T15:00:00Z', status: 'scheduled', home: { name: 'A' }, away: { name: 'B' } }],
      meta: { total_pages: 2 },
    });
  }, onRequest: () => { tracked += 1; } });
  const result = await client.fetchFixtures('2026-09-11');
  assert.equal(result.data.length, 2);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer stats-key');
  assert.equal(calls[0].url.searchParams.get('date_from'), '2026-09-11');
  assert.equal(calls[0].url.searchParams.get('date_to'), '2026-09-11');
  assert.equal(calls[0].url.searchParams.get('per_page'), '100');
  assert.equal(tracked, 2);
});

test('TheStatsAPI authentication failures are classified', async () => {
  const client = createProviderClient({ providerId: 'the-stats-api', apiKey: 'bad', dispatcher: {}, fetchImpl: async () => new Response('', { status: 401 }) });
  await assert.rejects(client.test(), { code: 'AUTH' });
});

test('normalizes TheSportsDB events to the shared fixture format', () => {
  const fixture = normalizeTheSportsDbEvent({
    idEvent: '2272541', strSport: 'Soccer', strTimestamp: '2026-09-11T15:00:00',
    idLeague: '4328', strLeague: 'English Premier League', strCountry: 'England',
    idHomeTeam: '1', strHomeTeam: 'Home', strHomeTeamBadge: 'home.png',
    idAwayTeam: '2', strAwayTeam: 'Away', strAwayTeamBadge: 'away.png',
    intHomeScore: '2', intAwayScore: '1', strStatus: 'In Play', strProgress: '67',
  });
  assert.equal(fixture.provider, 'the-sports-db');
  assert.equal(fixture.fixture.date, '2026-09-11T15:00:00Z');
  assert.deepEqual(fixture.fixture.status, { short: '2H', long: 'In Play', elapsed: 67 });
  assert.deepEqual(fixture.goals, { home: 2, away: 1 });
  assert.equal(fixture.teams.home.logo, 'home.png');
});

test('TheSportsDB uses the v1 key path and filters daily events to soccer', async () => {
  const calls = [];
  const client = createProviderClient({ providerId: 'the-sports-db', apiKey: '123', dispatcher: {}, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return Response.json({ events: [
      { idEvent: 'football', strSport: 'Soccer', dateEvent: '2026-09-11', strTime: '18:00:00', strHomeTeam: 'A', strAwayTeam: 'B' },
      { idEvent: 'baseball', strSport: 'Baseball', dateEvent: '2026-09-11', strTime: '19:00:00', strHomeTeam: 'C', strAwayTeam: 'D' },
    ] });
  } });
  const result = await client.fetchFixtures('2026-09-11');
  assert.equal(result.data.length, 1);
  assert.equal(result.data[0].fixture.date, '2026-09-11T18:00:00Z');
  assert.match(calls[0].url.pathname, /\/api\/v1\/json\/123\/eventsday\.php$/);
  assert.equal(calls[0].url.searchParams.get('d'), '2026-09-11');
  assert.equal(calls[0].url.searchParams.get('s'), 'Soccer');
  assert.equal(calls[0].options.headers.Accept, 'application/json');
});

test('TheSportsDB accepts an empty event day and classifies invalid keys', async () => {
  const empty = createProviderClient({ providerId: 'the-sports-db', apiKey: '123', dispatcher: {}, fetchImpl: async () => Response.json({ events: null }) });
  assert.deepEqual((await empty.fetchFixtures('2026-09-11')).data, []);
  const invalid = createProviderClient({ providerId: 'the-sports-db', apiKey: 'bad', dispatcher: {}, fetchImpl: async () => new Response('', { status: 404 }) });
  await assert.rejects(invalid.test(), { code: 'AUTH' });
});
