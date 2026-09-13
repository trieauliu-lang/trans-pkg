import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeProviderId } from './providers.js';

export function normalizeApiKey(value) {
  if (typeof value !== 'string') throw new Error('请输入 API Key');
  const apiKey = value.trim();
  if (!apiKey || apiKey === 'replace_with_your_api_key') throw new Error('请输入有效的 API Key');
  if (apiKey.length > 256 || /[\r\n\0]/.test(apiKey)) throw new Error('API Key 格式不正确');
  return apiKey;
}

export function maskApiKey(value) {
  if (!value) return null;
  return `••••${value.slice(-4)}`;
}

function keyId(value, provider) {
  return crypto.createHash('sha256').update(`${provider}:${value}`).digest('hex').slice(0, 16);
}

function normalizeLabel(value, apiKey) {
  const label = typeof value === 'string' ? value.trim() : '';
  if (label.length > 40) throw new Error('API Key 名称不能超过 40 个字符');
  return label || `API ${maskApiKey(apiKey)}`;
}

function keyRecord(apiKey, label, provider = 'api-football', source = 'saved', existing = {}) {
  const providerId = normalizeProviderId(provider);
  return {
    ...existing,
    id: existing.id || keyId(apiKey, providerId),
    label: normalizeLabel(label || existing.label, apiKey),
    key: apiKey,
    source,
    provider: providerId,
    createdAt: existing.createdAt || new Date().toISOString(),
    usageByDate: existing.usageByDate && typeof existing.usageByDate === 'object' ? existing.usageByDate : {},
  };
}

export function usageDate(value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(value);
}

export function recordApiKeyRequest(settings, id, { at = new Date(), kind = 'request' } = {}) {
  if (!getApiKey(settings, id)) return settings;
  const date = usageDate(at);
  return {
    ...settings,
    apiKeys: settings.apiKeys.map((item) => {
      if (item.id !== id) return item;
      const usageByDate = { ...(item.usageByDate || {}) };
      const current = usageByDate[date] || { total: 0, fixtures: 0, tests: 0 };
      usageByDate[date] = {
        total: Number(current.total || 0) + 1,
        fixtures: Number(current.fixtures || 0) + (kind === 'fixtures' ? 1 : 0),
        tests: Number(current.tests || 0) + (kind === 'test' ? 1 : 0),
      };
      const recentDates = Object.keys(usageByDate).sort().slice(-31);
      return { ...item, usageByDate: Object.fromEntries(recentDates.map((key) => [key, usageByDate[key]])), lastRequestAt: at.toISOString() };
    }),
  };
}

export function readApiKeySettings(file, environmentValue = '') {
  let stored = {};
  try { stored = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* First run or invalid legacy file. */ }
  const apiKeys = [];
  const addStored = (value, label, provider = 'api-football', existing = {}) => {
    try {
      const apiKey = normalizeApiKey(value);
      const providerId = normalizeProviderId(provider);
      if (!apiKeys.some((item) => item.provider === providerId && item.key === apiKey)) apiKeys.push(keyRecord(apiKey, label, providerId, 'saved', existing));
    } catch { /* Ignore invalid persisted entries. */ }
  };
  if (Array.isArray(stored.apiKeys)) stored.apiKeys.forEach((item) => addStored(item?.key, item?.label, item?.provider, item));
  else if (stored.apiKey) addStored(stored.apiKey, stored.label);

  const disabledEnvironmentApiKeyIds = Array.isArray(stored.disabledEnvironmentApiKeyIds)
    ? stored.disabledEnvironmentApiKeyIds.filter((id) => typeof id === 'string').slice(-20)
    : [];
  try {
    const environmentKey = normalizeApiKey(environmentValue);
    if (!apiKeys.some((item) => item.provider === 'api-football' && item.key === environmentKey)) {
      const record = keyRecord(environmentKey, '环境变量 API', 'api-football', 'environment');
      if (disabledEnvironmentApiKeyIds.includes(record.id)) throw new Error('环境变量 Key 已在页面停用');
      const persistedUsage = stored.apiKeyUsage?.[record.id];
      apiKeys.push(persistedUsage ? {
        ...record,
        usageByDate: persistedUsage.usageByDate || {},
        lastRequestAt: persistedUsage.lastRequestAt || null,
        latestQuota: persistedUsage.latestQuota || null,
        quotaUpdatedAt: persistedUsage.quotaUpdatedAt || null,
        quotaResetAt: persistedUsage.quotaResetAt || null,
      } : record);
    }
  } catch { /* Environment key is optional. */ }

  const activeApiKeyId = apiKeys.some((item) => item.id === stored.activeApiKeyId)
    ? stored.activeApiKeyId
    : apiKeys[0]?.id || null;
  return { apiKeys, activeApiKeyId, disabledEnvironmentApiKeyIds };
}

export function addApiKey(settings, value, label = '', provider = 'api-football') {
  const apiKey = normalizeApiKey(value);
  const providerId = normalizeProviderId(provider);
  const existing = settings.apiKeys.find((item) => item.provider === providerId && item.key === apiKey);
  const id = existing?.id || keyId(apiKey, providerId);
  const record = keyRecord(apiKey, label || existing?.label, providerId, existing?.source || 'saved', existing);
  const apiKeys = existing
    ? settings.apiKeys.map((item) => item.id === id ? record : item)
    : [...settings.apiKeys, record];
  return activateApiKey({ ...settings, apiKeys, activeApiKeyId: id }, id);
}

export function updateApiKeyProfile(settings, id, { label = '', provider } = {}) {
  const current = getApiKey(settings, id);
  if (!current) throw new Error('API Key 不存在');
  const providerId = normalizeProviderId(provider || current.provider);
  if (current.source === 'environment' && providerId !== current.provider) {
    throw new Error('环境变量 Key 的平台不能修改');
  }
  if (settings.apiKeys.some((item) => item.id !== id && item.provider === providerId && item.key === current.key)) {
    throw new Error('该平台已存在相同的 API Key');
  }
  const providerChanged = providerId !== current.provider;
  return {
    ...settings,
    apiKeys: settings.apiKeys.map((item) => item.id === id ? {
      ...item,
      label: normalizeLabel(label || item.label, item.key),
      provider: providerId,
      ...(providerChanged ? {
        testStatus: 'untested', testMessage: '', testedAt: null, testQuota: null,
        latestQuota: null, quotaUpdatedAt: null, quotaResetAt: null,
      } : {}),
    } : item),
  };
}

export function removeApiKey(settings, id) {
  const current = getApiKey(settings, id);
  if (!current) throw new Error('API Key 不存在');
  const apiKeys = settings.apiKeys.filter((item) => item.id !== id);
  return {
    ...settings,
    apiKeys,
    activeApiKeyId: settings.activeApiKeyId === id ? apiKeys[0]?.id || null : settings.activeApiKeyId,
    ...(current.source === 'environment' ? {
      disabledEnvironmentApiKeyIds: [...new Set([...(settings.disabledEnvironmentApiKeyIds || []), current.id])].slice(-20),
    } : {}),
  };
}

export function activateApiKey(settings, id) {
  if (!settings.apiKeys.some((item) => item.id === id)) throw new Error('API Key 不存在');
  const lastUsedAt = new Date().toISOString();
  return {
    ...settings,
    apiKeys: settings.apiKeys.map((item) => item.id === id ? { ...item, lastUsedAt } : item),
    activeApiKeyId: id,
  };
}

export function getActiveApiKey(settings) {
  return settings.apiKeys.find((item) => item.id === settings.activeApiKeyId)?.key || '';
}

export function getApiKey(settings, id) {
  return settings.apiKeys.find((item) => item.id === id) || null;
}

export function resolveTaskApiKey(settings, task) {
  if (task.apiKeyId) return getApiKey(settings, task.apiKeyId);
  return settings.apiKeys.find((item) => item.provider === task.providerId)
    || getApiKey(settings, settings.activeApiKeyId);
}

export function updateApiKeyTest(settings, id, { status, message, quota = null, testedAt = new Date().toISOString() }) {
  if (!['healthy', 'error'].includes(status)) throw new Error('API Key 测试状态不正确');
  if (!getApiKey(settings, id)) throw new Error('API Key 不存在');
  return {
    ...settings,
    apiKeys: settings.apiKeys.map((item) => item.id === id ? {
      ...item,
      testStatus: status,
      testMessage: String(message || '').slice(0, 240),
      testedAt,
      testQuota: quota,
      ...(quota && (quota.limit != null || quota.remaining != null) ? quotaSnapshot(item, quota, testedAt) : {}),
    } : item),
  };
}

function quotaSnapshot(item, quota, updatedAt) {
  const previousRemaining = Number(item.latestQuota?.remaining ?? item.testQuota?.remaining);
  const remaining = Number(quota?.remaining);
  const limit = Number(quota?.limit);
  const resetDetected = item.provider === 'api-football'
    && Number.isFinite(remaining)
    && Number.isFinite(limit)
    && ((Number.isFinite(previousRemaining) && remaining > previousRemaining)
      || (!item.quotaResetAt && remaining === limit));
  return {
    latestQuota: quota,
    quotaUpdatedAt: updatedAt,
    ...(resetDetected ? { quotaResetAt: updatedAt } : {}),
  };
}

export function updateApiKeyQuota(settings, id, quota, updatedAt = new Date().toISOString()) {
  if (!getApiKey(settings, id) || !quota || (quota.limit == null && quota.remaining == null)) return settings;
  return {
    ...settings,
    apiKeys: settings.apiKeys.map((item) => item.id === id ? { ...item, ...quotaSnapshot(item, quota, updatedAt) } : item),
  };
}

export function publicApiKeySettings(settings) {
  const today = usageDate();
  return {
    activeApiKeyId: settings.activeApiKeyId,
    apiKeys: settings.apiKeys.map(({ id, label, key, source, provider, createdAt, lastUsedAt, lastRequestAt, usageByDate, testStatus, testMessage, testedAt, testQuota, latestQuota, quotaUpdatedAt, quotaResetAt }) => {
      const todayUsage = usageByDate?.[today] || { total: 0, fixtures: 0, tests: 0 };
      const quota = latestQuota || testQuota || null;
      const limit = quota?.limit != null ? Number(quota.limit) : Number.NaN;
      const remaining = quota?.remaining != null ? Number(quota.remaining) : Number.NaN;
      const providerUsed = Number.isFinite(limit) && Number.isFinite(remaining) ? Math.max(0, limit - remaining) : null;
      const usagePercent = Number.isFinite(limit) && limit > 0 ? Math.min(100, Math.round(100 * (providerUsed ?? todayUsage.total) / limit)) : null;
      const usageLevel = usagePercent >= 95 ? 'danger' : usagePercent >= 80 ? 'warning' : 'normal';
      return {
        id, label, hint: maskApiKey(key), source, provider: provider || 'api-football', createdAt, lastUsedAt,
        lastRequestAt: lastRequestAt || null, todayUsage, latestQuota: quota, quotaUpdatedAt: quotaUpdatedAt || testedAt || null,
        quotaResetAt: quotaResetAt || null,
        providerUsed, usagePercent, usageLevel,
        usageHistory: Object.entries(usageByDate || {})
          .sort(([left], [right]) => right.localeCompare(left))
          .slice(0, 31)
          .map(([date, usage]) => ({ date, total: Number(usage.total || 0), fixtures: Number(usage.fixtures || 0), tests: Number(usage.tests || 0) })),
        testStatus: testStatus || 'untested', testMessage: testMessage || '', testedAt: testedAt || null,
        testQuota: testQuota || null, active: id === settings.activeApiKeyId,
      };
    }),
  };
}

export function saveApiKeySettings(file, settings) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporaryFile = `${file}.tmp`;
  const apiKeys = settings.apiKeys
    .filter((item) => item.source !== 'environment')
    .map(({ id, label, key, provider, createdAt, lastUsedAt, lastRequestAt, usageByDate, testStatus, testMessage, testedAt, testQuota, latestQuota, quotaUpdatedAt, quotaResetAt }) => ({
      id, label, key, provider, createdAt, lastUsedAt, lastRequestAt, usageByDate, testStatus, testMessage, testedAt, testQuota, latestQuota, quotaUpdatedAt, quotaResetAt,
    }));
  const apiKeyUsage = Object.fromEntries(settings.apiKeys.map(({ id, usageByDate, lastRequestAt, latestQuota, quotaUpdatedAt, quotaResetAt }) => [id, {
    usageByDate: usageByDate || {}, lastRequestAt: lastRequestAt || null, latestQuota: latestQuota || null, quotaUpdatedAt: quotaUpdatedAt || null, quotaResetAt: quotaResetAt || null,
  }]));
  fs.writeFileSync(temporaryFile, JSON.stringify({
    apiKeys,
    apiKeyUsage,
    activeApiKeyId: settings.activeApiKeyId,
    disabledEnvironmentApiKeyIds: settings.disabledEnvironmentApiKeyIds || [],
  }, null, 2), { mode: 0o600 });
  fs.renameSync(temporaryFile, file);
}
