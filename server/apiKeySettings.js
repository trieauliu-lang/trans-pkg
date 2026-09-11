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

  try {
    const environmentKey = normalizeApiKey(environmentValue);
    if (!apiKeys.some((item) => item.provider === 'api-football' && item.key === environmentKey)) {
      const record = keyRecord(environmentKey, '环境变量 API', 'api-football', 'environment');
      const persistedUsage = stored.apiKeyUsage?.[record.id];
      apiKeys.push(persistedUsage ? { ...record, usageByDate: persistedUsage.usageByDate || {}, lastRequestAt: persistedUsage.lastRequestAt || null } : record);
    }
  } catch { /* Environment key is optional. */ }

  const activeApiKeyId = apiKeys.some((item) => item.id === stored.activeApiKeyId)
    ? stored.activeApiKeyId
    : apiKeys[0]?.id || null;
  return { apiKeys, activeApiKeyId };
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
  return activateApiKey({ apiKeys, activeApiKeyId: id }, id);
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
      } : {}),
    } : item),
  };
}

export function removeApiKey(settings, id) {
  const current = getApiKey(settings, id);
  if (!current) throw new Error('API Key 不存在');
  if (current.source === 'environment') throw new Error('环境变量 Key 需要从服务器配置中删除');
  const apiKeys = settings.apiKeys.filter((item) => item.id !== id);
  return {
    apiKeys,
    activeApiKeyId: settings.activeApiKeyId === id ? apiKeys[0]?.id || null : settings.activeApiKeyId,
  };
}

export function activateApiKey(settings, id) {
  if (!settings.apiKeys.some((item) => item.id === id)) throw new Error('API Key 不存在');
  const lastUsedAt = new Date().toISOString();
  return {
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
    } : item),
  };
}

export function publicApiKeySettings(settings) {
  const today = usageDate();
  return {
    activeApiKeyId: settings.activeApiKeyId,
    apiKeys: settings.apiKeys.map(({ id, label, key, source, provider, createdAt, lastUsedAt, lastRequestAt, usageByDate, testStatus, testMessage, testedAt, testQuota }) => ({
      id, label, hint: maskApiKey(key), source, provider: provider || 'api-football', createdAt, lastUsedAt,
      lastRequestAt: lastRequestAt || null,
      todayUsage: usageByDate?.[today] || { total: 0, fixtures: 0, tests: 0 },
      testStatus: testStatus || 'untested', testMessage: testMessage || '', testedAt: testedAt || null,
      testQuota: testQuota || null, active: id === settings.activeApiKeyId,
    })),
  };
}

export function saveApiKeySettings(file, settings) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporaryFile = `${file}.tmp`;
  const apiKeys = settings.apiKeys
    .filter((item) => item.source !== 'environment')
    .map(({ id, label, key, provider, createdAt, lastUsedAt, lastRequestAt, usageByDate, testStatus, testMessage, testedAt, testQuota }) => ({
      id, label, key, provider, createdAt, lastUsedAt, lastRequestAt, usageByDate, testStatus, testMessage, testedAt, testQuota,
    }));
  const apiKeyUsage = Object.fromEntries(settings.apiKeys.map(({ id, usageByDate, lastRequestAt }) => [id, { usageByDate: usageByDate || {}, lastRequestAt: lastRequestAt || null }]));
  fs.writeFileSync(temporaryFile, JSON.stringify({ apiKeys, apiKeyUsage, activeApiKeyId: settings.activeApiKeyId }, null, 2), { mode: 0o600 });
  fs.renameSync(temporaryFile, file);
}
