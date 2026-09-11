import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

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

function keyId(value) {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function normalizeLabel(value, apiKey) {
  const label = typeof value === 'string' ? value.trim() : '';
  if (label.length > 40) throw new Error('API Key 名称不能超过 40 个字符');
  return label || `API ${maskApiKey(apiKey)}`;
}

function keyRecord(apiKey, label, source = 'saved', existing = {}) {
  return {
    ...existing,
    id: keyId(apiKey),
    label: normalizeLabel(label || existing.label, apiKey),
    key: apiKey,
    source,
    createdAt: existing.createdAt || new Date().toISOString(),
  };
}

export function readApiKeySettings(file, environmentValue = '') {
  let stored = {};
  try { stored = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* First run or invalid legacy file. */ }
  const apiKeys = [];
  const addStored = (value, label, existing = {}) => {
    try {
      const apiKey = normalizeApiKey(value);
      if (!apiKeys.some((item) => item.id === keyId(apiKey))) apiKeys.push(keyRecord(apiKey, label, 'saved', existing));
    } catch { /* Ignore invalid persisted entries. */ }
  };
  if (Array.isArray(stored.apiKeys)) stored.apiKeys.forEach((item) => addStored(item?.key, item?.label, item));
  else if (stored.apiKey) addStored(stored.apiKey, stored.label);

  try {
    const environmentKey = normalizeApiKey(environmentValue);
    if (!apiKeys.some((item) => item.id === keyId(environmentKey))) apiKeys.push(keyRecord(environmentKey, '环境变量 API', 'environment'));
  } catch { /* Environment key is optional. */ }

  const activeApiKeyId = apiKeys.some((item) => item.id === stored.activeApiKeyId)
    ? stored.activeApiKeyId
    : apiKeys[0]?.id || null;
  return { apiKeys, activeApiKeyId };
}

export function addApiKey(settings, value, label = '') {
  const apiKey = normalizeApiKey(value);
  const id = keyId(apiKey);
  const existing = settings.apiKeys.find((item) => item.id === id);
  const record = keyRecord(apiKey, label || existing?.label, existing?.source || 'saved', existing);
  const apiKeys = existing
    ? settings.apiKeys.map((item) => item.id === id ? record : item)
    : [...settings.apiKeys, record];
  return activateApiKey({ apiKeys, activeApiKeyId: id }, id);
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

export function publicApiKeySettings(settings) {
  return {
    activeApiKeyId: settings.activeApiKeyId,
    apiKeys: settings.apiKeys.map(({ id, label, key, source, createdAt, lastUsedAt }) => ({
      id, label, hint: maskApiKey(key), source, createdAt, lastUsedAt, active: id === settings.activeApiKeyId,
    })),
  };
}

export function saveApiKeySettings(file, settings) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporaryFile = `${file}.tmp`;
  const apiKeys = settings.apiKeys
    .filter((item) => item.source !== 'environment')
    .map(({ id, label, key, createdAt, lastUsedAt }) => ({ id, label, key, createdAt, lastUsedAt }));
  fs.writeFileSync(temporaryFile, JSON.stringify({ apiKeys, activeApiKeyId: settings.activeApiKeyId }, null, 2), { mode: 0o600 });
  fs.renameSync(temporaryFile, file);
}
