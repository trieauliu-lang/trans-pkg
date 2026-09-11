const LIVE_STATUSES = new Set(['1H', 'HT', '2H', 'ET', 'BT', 'P', 'INT', 'LIVE']);
const TERMINAL_STATUSES = new Set(['FT', 'AET', 'PEN', 'CANC', 'ABD', 'AWD', 'WO']);

export function fixtureCacheTtl(fixtures, now = Date.now(), liveTtlMs = 5 * 60_000) {
  if (!fixtures.length) return 10 * 60_000;
  const statuses = fixtures.map((item) => item.fixture?.status?.short);
  if (statuses.some((status) => LIVE_STATUSES.has(status))) return liveTtlMs;
  if (statuses.every((status) => TERMINAL_STATUSES.has(status))) return 6 * 60 * 60_000;

  const upcoming = fixtures
    .filter((item) => item.fixture?.status?.short === 'NS')
    .map((item) => Date.parse(item.fixture?.date))
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  if (!upcoming.length) return 15 * 60_000;
  const untilKickoff = upcoming[0] - now;
  if (untilKickoff > 6 * 60 * 60_000) return 60 * 60_000;
  if (untilKickoff > 2 * 60 * 60_000) return 30 * 60_000;
  if (untilKickoff > 15 * 60_000) return 10 * 60_000;
  return liveTtlMs;
}

export function createFixtureCache({ loader, initial = {}, persist = () => {}, now = () => Date.now(), liveTtlMs } = {}) {
  const entries = new Map(Object.entries(initial).filter(([, value]) => value?.fetchedAt && Array.isArray(value?.data)));
  const inflight = new Map();
  let quota = Object.values(initial).map((item) => item?.quota).find(Boolean) || null;

  const snapshot = () => Object.fromEntries(entries);
  async function get(key, { allowStale = false, protectQuota = false, quotaReserve = 10 } = {}) {
    const cached = entries.get(key);
    const ageMs = cached ? Math.max(0, now() - Date.parse(cached.fetchedAt)) : Infinity;
    const ttlMs = cached ? fixtureCacheTtl(cached.data, now(), liveTtlMs) : 0;
    if (cached && ageMs < ttlMs) return { ...cached, source: 'cache', ageMs, ttlMs, stale: false };
    if (protectQuota && cached && Number(quota?.remaining) <= quotaReserve) {
      return { ...cached, quota, source: 'cache', ageMs, ttlMs, stale: true, quotaProtected: true };
    }
    if (inflight.has(key)) {
      const result = await inflight.get(key);
      return { ...result, source: 'shared' };
    }

    const request = loader(key).then((result) => {
      quota = result.quota || quota;
      const entry = { data: result.data, quota, fetchedAt: new Date(now()).toISOString() };
      entries.set(key, entry);
      persist(snapshot());
      return { ...entry, source: 'api', ageMs: 0, ttlMs: fixtureCacheTtl(entry.data, now(), liveTtlMs), stale: false };
    }).finally(() => inflight.delete(key));
    inflight.set(key, request);
    try {
      return await request;
    } catch (error) {
      if (allowStale && cached) return { ...cached, quota, source: 'stale', ageMs, ttlMs, stale: true, error: error.message };
      throw error;
    }
  }
  return { get, snapshot };
}
