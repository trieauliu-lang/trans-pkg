import { EnvHttpProxyAgent, fetch } from 'undici';
import { createFootballClient, FootballError, networkError } from './footballClient.js';

export const PROVIDERS = {
  'api-football': { id: 'api-football', label: 'API-Football' },
  'the-stats-api': { id: 'the-stats-api', label: 'TheStatsAPI' },
  'the-sports-db': { id: 'the-sports-db', label: 'TheSportsDB' },
};

export function normalizeProviderId(value) {
  const id = value || 'api-football';
  if (!PROVIDERS[id]) throw new Error('不支持的 API 平台');
  return id;
}

const STATUS_MAP = {
  scheduled: 'NS', not_started: 'NS', live: 'LIVE', in_play: 'LIVE',
  half_time: 'HT', halftime: 'HT', finished: 'FT', completed: 'FT',
  postponed: 'PST', cancelled: 'CANC', canceled: 'CANC', abandoned: 'ABD', suspended: 'SUSP',
  awarded: 'AWD', walkover: 'WO', walk_over: 'WO',
};

export function normalizeTheStatsMatch(match) {
  const home = match.home_team || match.home || {};
  const away = match.away_team || match.away || {};
  const rawStatus = String(match.status || 'scheduled').toLowerCase();
  const minute = Number(match.minute ?? match.elapsed ?? 0) || null;
  let status = STATUS_MAP[rawStatus] || rawStatus.toUpperCase();
  if (status === 'LIVE' && minute != null) status = minute <= 45 ? '1H' : '2H';
  const competition = match.competition || {};
  const score = match.score || match.scores || {};
  const homeScore = score.home ?? score.home_score ?? home.score ?? null;
  const awayScore = score.away ?? score.away_score ?? away.score ?? null;
  return {
    provider: 'the-stats-api',
    fixture: {
      id: match.id || match.match_id,
      date: match.utc_date || match.kickoff_utc || match.date,
      status: { short: status, long: rawStatus, elapsed: minute },
    },
    league: {
      id: match.competition_id || competition.id || competition.competition_id || '',
      name: typeof competition === 'string' ? competition : competition.name || match.competition_name || '未知赛事',
      country: typeof competition === 'object' ? competition.country || match.country || '' : match.country || '',
      logo: typeof competition === 'object' ? competition.logo || '' : '',
    },
    teams: {
      home: { id: home.id || home.team_id || '', name: home.name || '主队待定', logo: home.logo || '' },
      away: { id: away.id || away.team_id || '', name: away.name || '客队待定', logo: away.logo || '' },
    },
    goals: { home: homeScore == null ? null : Number(homeScore), away: awayScore == null ? null : Number(awayScore) },
  };
}

const SPORTS_DB_STATUS_MAP = {
  '': 'NS', NS: 'NS', 'NOT STARTED': 'NS', 'TIME TO BE DEFINED': 'NS', TBD: 'NS',
  LIVE: 'LIVE', 'IN PLAY': 'LIVE', 'IN PROGRESS': 'LIVE',
  'MATCH FINISHED': 'FT', FINISHED: 'FT', FINAL: 'FT', FT: 'FT',
  AOT: 'AET', 'AFTER OVERTIME': 'AET', 'AFTER EXTRA TIME': 'AET',
  POST: 'PST', POSTPONED: 'PST', 'MATCH POSTPONED': 'PST',
  CANCELLED: 'CANC', CANCELED: 'CANC', 'MATCH CANCELLED': 'CANC',
  ABANDONED: 'ABD', SUSPENDED: 'SUSP', INTERRUPTED: 'INT',
  AWARDED: 'AWD', WALKOVER: 'WO', 'WALK OVER': 'WO',
};

function sportsDbDate(event) {
  const value = event.strTimestamp || (event.dateEvent && `${event.dateEvent}T${event.strTime || '00:00:00'}`);
  if (!value) return null;
  const normalized = value.replace(' ', 'T');
  return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized) ? normalized : `${normalized}Z`;
}

export function normalizeTheSportsDbEvent(event) {
  const rawStatus = String(event.strStatus || '').trim();
  const upperStatus = rawStatus.toUpperCase();
  const progress = String(event.strProgress || '').trim();
  const elapsedMatch = progress.match(/\d+/);
  const elapsed = elapsedMatch ? Number(elapsedMatch[0]) : null;
  let status = SPORTS_DB_STATUS_MAP[upperStatus] || upperStatus || 'NS';
  if (String(event.strPostponed || '').toLowerCase() === 'yes') status = 'PST';
  if (status === 'LIVE' && elapsed != null) status = elapsed <= 45 ? '1H' : '2H';
  const score = (value) => {
    if (value == null || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };
  return {
    provider: 'the-sports-db',
    fixture: {
      id: event.idEvent,
      date: sportsDbDate(event),
      status: { short: status, long: rawStatus || status, elapsed },
    },
    league: {
      id: event.idLeague || '',
      name: event.strLeague || '未知赛事',
      country: event.strCountry || '',
      logo: event.strLeagueBadge || '',
    },
    teams: {
      home: { id: event.idHomeTeam || '', name: event.strHomeTeam || '主队待定', logo: event.strHomeTeamBadge || '' },
      away: { id: event.idAwayTeam || '', name: event.strAwayTeam || '客队待定', logo: event.strAwayTeamBadge || '' },
    },
    goals: { home: score(event.intHomeScore), away: score(event.intAwayScore) },
  };
}

function quotaFromHeaders(headers) {
  return {
    remaining: headers.get('x-ratelimit-requests-remaining') || headers.get('x-ratelimit-remaining') || null,
    limit: headers.get('x-ratelimit-requests-limit') || headers.get('x-ratelimit-limit') || null,
  };
}

function createTheStatsApiClient({ apiKey, timeoutMs = 15_000, fetchImpl = fetch, dispatcher, onRequest = () => {} } = {}) {
  const agent = dispatcher ?? new EnvHttpProxyAgent();
  async function request(endpoint, params = {}) {
    const url = new URL(`https://api.thestatsapi.com/api/${endpoint}`);
    Object.entries(params).forEach(([key, value]) => value != null && value !== '' && url.searchParams.set(key, value));
    try {
      onRequest();
      const response = await fetchImpl(url, {
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
        dispatcher: agent,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if ([401, 403].includes(response.status)) throw new FootballError('AUTH', 'TheStatsAPI 拒绝访问，请检查 API Key 和订阅状态。');
      if (response.status === 429) throw new FootballError('RATE_LIMIT', 'TheStatsAPI 请求频率或套餐额度已达限制。');
      if (!response.ok) throw new FootballError('UPSTREAM', `TheStatsAPI 暂时不可用（HTTP ${response.status}）。`);
      let body;
      try { body = await response.json(); } catch { throw new FootballError('INVALID_RESPONSE', 'TheStatsAPI 返回了无效数据。'); }
      if (!body || !Array.isArray(body.data)) throw new FootballError('INVALID_RESPONSE', 'TheStatsAPI 返回的数据格式不正确。');
      return { data: body.data, meta: body.meta || {}, quota: quotaFromHeaders(response.headers) };
    } catch (error) { throw networkError(error); }
  }
  return {
    async fetchFixtures(date) {
      const all = [];
      let page = 1;
      let totalPages = 1;
      let quota = null;
      do {
        const result = await request('football/matches', { date_from: date, date_to: date, per_page: 100, page });
        all.push(...result.data);
        quota = result.quota;
        totalPages = Math.min(10, Math.max(1, Number(result.meta.total_pages) || 1));
        page += 1;
      } while (page <= totalPages);
      return { data: all.map(normalizeTheStatsMatch).filter((item) => item.fixture.id && item.fixture.date), quota };
    },
    async test() {
      const result = await request('football/competitions', { per_page: 1 });
      return { quota: result.quota };
    },
  };
}

function createTheSportsDbClient({ apiKey, timeoutMs = 15_000, fetchImpl = fetch, dispatcher, onRequest = () => {} } = {}) {
  const agent = dispatcher ?? new EnvHttpProxyAgent();
  async function request(endpoint, params = {}, collection) {
    const url = new URL(`https://www.thesportsdb.com/api/v1/json/${encodeURIComponent(apiKey)}/${endpoint}`);
    Object.entries(params).forEach(([key, value]) => value != null && value !== '' && url.searchParams.set(key, value));
    try {
      onRequest();
      const response = await fetchImpl(url, {
        headers: { Accept: 'application/json' }, dispatcher: agent,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if ([401, 403, 404].includes(response.status)) {
        await response.body?.cancel();
        throw new FootballError('AUTH', 'TheSportsDB 拒绝访问，请检查 API Key 和订阅状态。');
      }
      if (response.status === 429) {
        await response.body?.cancel();
        throw new FootballError('RATE_LIMIT', 'TheSportsDB 请求频率已达限制，请稍后重试。');
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new FootballError('UPSTREAM', `TheSportsDB 暂时不可用（HTTP ${response.status}）。`);
      }
      let body;
      try { body = await response.json(); } catch { throw new FootballError('INVALID_RESPONSE', 'TheSportsDB 返回了无效数据。'); }
      if (body?.error || body?.errors) throw new FootballError('AUTH', 'TheSportsDB 拒绝访问，请检查 API Key 和订阅状态。');
      if (!body || !(Array.isArray(body[collection]) || body[collection] === null)) {
        throw new FootballError('INVALID_RESPONSE', 'TheSportsDB 返回的数据格式不正确。');
      }
      return { data: body[collection] || [], quota: quotaFromHeaders(response.headers) };
    } catch (error) { throw networkError(error); }
  }
  return {
    async fetchFixtures(date) {
      const result = await request('eventsday.php', { d: date, s: 'Soccer' }, 'events');
      return {
        data: result.data
          .filter((event) => !event.strSport || event.strSport.toLowerCase() === 'soccer')
          .map(normalizeTheSportsDbEvent)
          .filter((item) => item.fixture.id && item.fixture.date),
        quota: result.quota,
      };
    },
    async test() {
      const result = await request('all_sports.php', {}, 'sports');
      return { quota: result.quota };
    },
  };
}

export function createProviderClient({ providerId, apiKey, fetchImpl, dispatcher, timeoutMs, onRequest } = {}) {
  const id = normalizeProviderId(providerId);
  if (id === 'the-stats-api') return createTheStatsApiClient({ apiKey, fetchImpl, dispatcher, timeoutMs, onRequest });
  if (id === 'the-sports-db') return createTheSportsDbClient({ apiKey, fetchImpl, dispatcher, timeoutMs, onRequest });
  const request = createFootballClient({ apiKey, fetchImpl, dispatcher, timeoutMs, onRequest });
  return {
    fetchFixtures: (date, timezone = 'Asia/Shanghai') => request('fixtures', { date, timezone }),
    test: async () => {
      const result = await request('status', {}, { responseType: 'object' });
      const limit = Number(result.data?.requests?.limit_day);
      const used = Number(result.data?.requests?.current);
      const quota = {
        limit: result.quota.limit ?? (Number.isFinite(limit) ? String(limit) : null),
        remaining: result.quota.remaining ?? (Number.isFinite(limit) && Number.isFinite(used) ? String(Math.max(0, limit - used)) : null),
      };
      return { quota };
    },
  };
}
