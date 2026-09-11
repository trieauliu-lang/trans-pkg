import { EnvHttpProxyAgent, fetch } from 'undici';
import { createFootballClient, FootballError, networkError } from './footballClient.js';

export const PROVIDERS = {
  'api-football': { id: 'api-football', label: 'API-Football' },
  'the-stats-api': { id: 'the-stats-api', label: 'TheStatsAPI' },
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
};

export function normalizeTheStatsMatch(match) {
  const home = match.home_team || match.home || {};
  const away = match.away_team || match.away || {};
  const rawStatus = String(match.status || 'scheduled').toLowerCase();
  const minute = Number(match.minute ?? match.elapsed ?? 0) || null;
  let status = STATUS_MAP[rawStatus] || rawStatus.toUpperCase();
  if (status === 'LIVE') status = minute && minute <= 45 ? '1H' : '2H';
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

function quotaFromHeaders(headers) {
  return {
    remaining: headers.get('x-ratelimit-requests-remaining') || headers.get('x-ratelimit-remaining') || null,
    limit: headers.get('x-ratelimit-requests-limit') || headers.get('x-ratelimit-limit') || null,
  };
}

function createTheStatsApiClient({ apiKey, timeoutMs = 15_000, fetchImpl = fetch, dispatcher } = {}) {
  const agent = dispatcher ?? new EnvHttpProxyAgent();
  async function request(endpoint, params = {}) {
    const url = new URL(`https://api.thestatsapi.com/api/${endpoint}`);
    Object.entries(params).forEach(([key, value]) => value != null && value !== '' && url.searchParams.set(key, value));
    try {
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

export function createProviderClient({ providerId, apiKey, fetchImpl, dispatcher, timeoutMs } = {}) {
  const id = normalizeProviderId(providerId);
  if (id === 'the-stats-api') return createTheStatsApiClient({ apiKey, fetchImpl, dispatcher, timeoutMs });
  const request = createFootballClient({ apiKey, fetchImpl, dispatcher, timeoutMs });
  return {
    fetchFixtures: (date, timezone = 'Asia/Shanghai') => request('fixtures', { date, timezone }),
    test: async () => ({ quota: (await request('timezone')).quota }),
  };
}
