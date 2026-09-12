import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  activateApiKey, addApiKey, getActiveApiKey, maskApiKey, normalizeApiKey, resolveTaskApiKey,
  publicApiKeySettings, readApiKeySettings, recordApiKeyRequest, removeApiKey, saveApiKeySettings, updateApiKeyProfile, updateApiKeyQuota, updateApiKeyTest,
} from './apiKeySettings.js';

test('counts each upstream request per key and per Shanghai calendar day', () => {
  let settings = addApiKey({ apiKeys: [], activeApiKeyId: null }, 'usage-key', '用量测试');
  const id = settings.activeApiKeyId;
  settings = recordApiKeyRequest(settings, id, { at: new Date('2026-09-11T15:59:00Z'), kind: 'fixtures' });
  settings = recordApiKeyRequest(settings, id, { at: new Date('2026-09-11T16:01:00Z'), kind: 'test' });
  settings = recordApiKeyRequest(settings, id, { at: new Date('2026-09-11T16:02:00Z'), kind: 'fixtures' });
  assert.deepEqual(settings.apiKeys[0].usageByDate['2026-09-11'], { total: 1, fixtures: 1, tests: 0 });
  assert.deepEqual(settings.apiKeys[0].usageByDate['2026-09-12'], { total: 2, fixtures: 1, tests: 1 });
  assert.equal(settings.apiKeys[0].lastRequestAt, '2026-09-11T16:02:00.000Z');
  const history = publicApiKeySettings(settings).apiKeys[0].usageHistory;
  assert.deepEqual(history.map((item) => item.date), ['2026-09-12', '2026-09-11']);
  assert.deepEqual(history[0], { date: '2026-09-12', total: 2, fixtures: 1, tests: 1 });
});

test('persists request usage for an environment key without saving its secret', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'match-pulse-env-usage-'));
  const file = path.join(directory, 'settings.json');
  try {
    let settings = readApiKeySettings(file, 'environment-secret');
    settings = recordApiKeyRequest(settings, settings.activeApiKeyId, { at: new Date('2026-09-12T01:00:00Z'), kind: 'fixtures' });
    saveApiKeySettings(file, settings);
    assert.ok(!fs.readFileSync(file, 'utf8').includes('environment-secret'));
    const reloaded = readApiKeySettings(file, 'environment-secret');
    assert.equal(reloaded.apiKeys[0].usageByDate['2026-09-12'].total, 1);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('uses provider quota to classify API key usage warnings', () => {
  let settings = addApiKey({ apiKeys: [], activeApiKeyId: null }, 'quota-key', '额度测试');
  settings = updateApiKeyQuota(settings, settings.activeApiKeyId, { limit: '100', remaining: '18' });
  let profile = publicApiKeySettings(settings).apiKeys[0];
  assert.equal(profile.providerUsed, 82);
  assert.equal(profile.usagePercent, 82);
  assert.equal(profile.usageLevel, 'warning');
  settings = updateApiKeyQuota(settings, settings.activeApiKeyId, { limit: '100', remaining: '4' });
  profile = publicApiKeySettings(settings).apiKeys[0];
  assert.equal(profile.usageLevel, 'danger');
});

test('task API key binding stays fixed when the active key changes', () => {
  let settings = addApiKey({ apiKeys: [], activeApiKeyId: null }, 'first-key', '第一组');
  const fixedId = settings.activeApiKeyId;
  settings = addApiKey(settings, 'second-key', '第二组');
  assert.notEqual(settings.activeApiKeyId, fixedId);
  assert.equal(resolveTaskApiKey(settings, { apiKeyId: fixedId }).id, fixedId);
  const removed = removeApiKey(settings, fixedId);
  assert.equal(resolveTaskApiKey(removed, { apiKeyId: fixedId }), null);
});

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

test('updates an existing key provider and clears its stale test result', () => {
  let settings = addApiKey({ apiKeys: [], activeApiKeyId: null }, 'shared-secret-1234', '订阅账号', 'the-stats-api');
  const id = settings.activeApiKeyId;
  settings = updateApiKeyTest(settings, id, { status: 'error', message: '旧平台拒绝访问' });
  settings = updateApiKeyProfile(settings, id, { label: '备用比分', provider: 'api-football' });
  const profile = settings.apiKeys[0];
  assert.equal(profile.id, id);
  assert.equal(profile.provider, 'api-football');
  assert.equal(profile.label, '备用比分');
  assert.equal(profile.testStatus, 'untested');
  assert.equal(profile.testMessage, '');
  assert.equal(profile.testedAt, null);
  assert.equal(settings.activeApiKeyId, id);
});

test('rejects rebinding to a duplicate provider and changing an environment key provider', () => {
  let settings = addApiKey({ apiKeys: [], activeApiKeyId: null }, 'same-secret', 'Football', 'api-football');
  settings = addApiKey(settings, 'same-secret', 'Stats', 'the-stats-api');
  const statsId = settings.activeApiKeyId;
  assert.throws(() => updateApiKeyProfile(settings, statsId, { provider: 'api-football' }), /已存在/);
  const environmentSettings = readApiKeySettings('missing-settings.json', 'environment-key');
  assert.throws(() => updateApiKeyProfile(environmentSettings, environmentSettings.activeApiKeyId, { provider: 'the-sports-db' }), /环境变量/);
});

test('deletes saved keys and selects a remaining key when the active one is removed', () => {
  let settings = addApiKey({ apiKeys: [], activeApiKeyId: null }, 'first-key', '第一组');
  const firstId = settings.activeApiKeyId;
  settings = addApiKey(settings, 'second-key', '第二组', 'the-sports-db');
  const secondId = settings.activeApiKeyId;
  settings = removeApiKey(settings, secondId);
  assert.equal(settings.apiKeys.length, 1);
  assert.equal(settings.activeApiKeyId, firstId);
  settings = removeApiKey(settings, firstId);
  assert.deepEqual(settings, { apiKeys: [], activeApiKeyId: null });
});

test('deleting an inactive key preserves the active key', () => {
  let settings = addApiKey({ apiKeys: [], activeApiKeyId: null }, 'first-key', '第一组');
  const firstId = settings.activeApiKeyId;
  settings = addApiKey(settings, 'second-key', '第二组');
  const secondId = settings.activeApiKeyId;
  settings = removeApiKey(settings, firstId);
  assert.equal(settings.activeApiKeyId, secondId);
  assert.throws(() => removeApiKey(settings, 'missing'), /不存在/);
});

test('deleting an environment key keeps it hidden after a server restart without persisting its secret', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'match-pulse-env-delete-'));
  const file = path.join(directory, 'settings.json');
  try {
    let settings = readApiKeySettings(file, 'environment-secret-delete');
    const environmentId = settings.activeApiKeyId;
    settings = removeApiKey(settings, environmentId);
    assert.equal(settings.apiKeys.length, 0);
    assert.deepEqual(settings.disabledEnvironmentApiKeyIds, [environmentId]);
    saveApiKeySettings(file, settings);
    const savedText = fs.readFileSync(file, 'utf8');
    assert.ok(!savedText.includes('environment-secret-delete'));
    const reloaded = readApiKeySettings(file, 'environment-secret-delete');
    assert.equal(reloaded.apiKeys.length, 0);
    assert.equal(reloaded.activeApiKeyId, null);
    assert.deepEqual(reloaded.disabledEnvironmentApiKeyIds, [environmentId]);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
