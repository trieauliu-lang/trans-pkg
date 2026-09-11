import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  activateApiKey, addApiKey, getActiveApiKey, maskApiKey, normalizeApiKey,
  publicApiKeySettings, readApiKeySettings, saveApiKeySettings, updateApiKeyTest,
} from './apiKeySettings.js';

test('normalizes and masks an API key without exposing it', () => {
  assert.equal(normalizeApiKey('  abcdef123456  '), 'abcdef123456');
  assert.equal(maskApiKey('abcdef123456'), '••••3456');
  assert.throws(() => normalizeApiKey('  '), /有效/);
  assert.throws(() => normalizeApiKey('abc\ndef'), /格式/);
});

test('adds, deduplicates, names and switches cached keys', () => {
  let settings = { apiKeys: [], activeApiKeyId: null };
  settings = addApiKey(settings, 'first-secret-1111', '主要账号');
  const firstId = settings.activeApiKeyId;
  settings = addApiKey(settings, 'second-secret-2222', '备用账号');
  const secondId = settings.activeApiKeyId;
  assert.equal(settings.apiKeys.length, 2);
  settings = addApiKey(settings, 'second-secret-2222', 'Stats 账号', 'the-stats-api');
  assert.equal(settings.apiKeys.length, 3);
  assert.equal(settings.apiKeys.find((item) => item.provider === 'the-stats-api').label, 'Stats 账号');
  settings = activateApiKey(settings, secondId);
  assert.equal(getActiveApiKey(settings), 'second-secret-2222');
  settings = addApiKey(settings, ' first-secret-1111 ', '主账号更新名称');
  assert.equal(settings.apiKeys.length, 3);
  assert.equal(settings.apiKeys.find((item) => item.id === firstId).label, '主账号更新名称');
  settings = activateApiKey(settings, secondId);
  assert.equal(getActiveApiKey(settings), 'second-secret-2222');
  assert.throws(() => activateApiKey(settings, 'missing'), /不存在/);
  settings = updateApiKeyTest(settings, secondId, {
    status: 'error', message: '比分服务拒绝访问', quota: { remaining: '0', limit: '100' },
  });
  const tested = publicApiKeySettings(settings).apiKeys.find((item) => item.id === secondId);
  assert.equal(tested.testStatus, 'error');
  assert.equal(tested.testQuota.remaining, '0');
});

test('saves multiple keys, migrates legacy data and never exposes full values publicly', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'match-pulse-key-'));
  const file = path.join(directory, 'settings.json');
  try {
    fs.writeFileSync(file, JSON.stringify({ apiKey: 'legacy-secret-0000' }));
    let settings = readApiKeySettings(file, 'environment-secret-9999');
    assert.equal(settings.apiKeys.length, 2);
    settings = addApiKey(settings, 'new-secret-1234', '新 Key');
    settings = updateApiKeyTest(settings, settings.activeApiKeyId, {
      status: 'healthy', message: '连接正常', quota: { remaining: '88', limit: '100' },
    });
    saveApiKeySettings(file, settings);
    const savedText = fs.readFileSync(file, 'utf8');
    assert.ok(savedText.includes('legacy-secret-0000'));
    assert.ok(savedText.includes('new-secret-1234'));
    assert.ok(!savedText.includes('environment-secret-9999'));
    const publicValue = JSON.stringify(publicApiKeySettings(settings));
    assert.ok(publicValue.includes('••••1234'));
    assert.ok(!publicValue.includes('new-secret-1234'));
    const reloaded = readApiKeySettings(file);
    const active = publicApiKeySettings(reloaded).apiKeys.find((item) => item.active);
    assert.equal(active.testStatus, 'healthy');
    assert.equal(active.testQuota.remaining, '88');
    assert.ok(!fs.existsSync(`${file}.tmp`));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
