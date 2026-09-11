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

export function readSavedApiKey(file) {
  try { return normalizeApiKey(JSON.parse(fs.readFileSync(file, 'utf8')).apiKey); } catch { return ''; }
}

export function saveApiKey(file, value) {
  const apiKey = normalizeApiKey(value);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporaryFile = `${file}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify({ apiKey }, null, 2), { mode: 0o600 });
  fs.renameSync(temporaryFile, file);
  return apiKey;
}
