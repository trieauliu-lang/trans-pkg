const SNAPSHOT_STORE_KEY = 'matchPulse:fixtureSnapshots:v3';
const ACTIVE_SCOPE_KEY = 'matchPulse:activeFixtureScope:v1';
const LEGACY_SNAPSHOT_KEY = 'matchPulse:fixtureSnapshot:v2';

function validSnapshot(snapshot) {
  return Boolean(snapshot
    && /^\d{4}-\d{2}-\d{2}$/.test(snapshot.date)
    && Array.isArray(snapshot.fixtures));
}

function readJson(storage, key, fallback) {
  try {
    return JSON.parse(storage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

export function fixtureSnapshotScope(apiKeyId, providerId) {
  return apiKeyId && providerId ? `${apiKeyId}|${providerId}` : 'demo';
}

export function rememberedFixtureScope(storage = localStorage) {
  try {
    return storage.getItem(ACTIVE_SCOPE_KEY) || '';
  } catch {
    return '';
  }
}

export function rememberFixtureScope(scope, storage = localStorage) {
  try {
    storage.setItem(ACTIVE_SCOPE_KEY, scope);
  } catch { /* Browser storage may be disabled. */ }
}

export function readFixtureSnapshot(scope = rememberedFixtureScope(), storage = localStorage) {
  if (!scope) return null;
  const snapshots = readJson(storage, SNAPSHOT_STORE_KEY, {});
  const snapshot = snapshots?.[scope];
  if (validSnapshot(snapshot)) return snapshot;

  const legacy = readJson(storage, LEGACY_SNAPSHOT_KEY, null);
  const rememberedScope = rememberedFixtureScope(storage);
  return (!rememberedScope || rememberedScope === scope) && validSnapshot(legacy) ? legacy : null;
}

export function writeFixtureSnapshot(scope, date, fixtures, meta, storage = localStorage) {
  if (!scope) return;
  try {
    const snapshots = readJson(storage, SNAPSHOT_STORE_KEY, {});
    snapshots[scope] = {
      date,
      fixtures,
      meta,
      queried: true,
      savedAt: new Date().toISOString(),
    };
    storage.setItem(SNAPSHOT_STORE_KEY, JSON.stringify(snapshots));
    storage.setItem(ACTIVE_SCOPE_KEY, scope);
    storage.setItem('matchPulse:fixtureDate', date);
    storage.removeItem(LEGACY_SNAPSHOT_KEY);
    storage.removeItem('matchPulse:fixtures');
    storage.removeItem('matchPulse:fixtureMeta');
    storage.removeItem('matchPulse:hasQueried');
  } catch { /* Server cache remains available when browser storage is full or blocked. */ }
}

export function removeFixtureSnapshot(scope, storage = localStorage) {
  if (!scope) return;
  try {
    const snapshots = readJson(storage, SNAPSHOT_STORE_KEY, {});
    delete snapshots[scope];
    storage.setItem(SNAPSHOT_STORE_KEY, JSON.stringify(snapshots));
  } catch { /* Browser storage may be disabled. */ }
}
