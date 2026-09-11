import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { maskApiKey, normalizeApiKey, readSavedApiKey, saveApiKey } from './apiKeySettings.js';

test('normalizes and masks an API key without exposing it', () => {
  assert.equal(normalizeApiKey('  abcdef123456  '), 'abcdef123456');
  assert.equal(maskApiKey('abcdef123456'), '••••3456');
  assert.throws(() => normalizeApiKey('  '), /有效/);
  assert.throws(() => normalizeApiKey('abc\ndef'), /格式/);
});

test('saves and reloads the local API key', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'match-pulse-key-'));
  const file = path.join(directory, 'settings.json');
  try {
    saveApiKey(file, 'local-secret-key');
    assert.equal(readSavedApiKey(file), 'local-secret-key');
    assert.ok(!fs.existsSync(`${file}.tmp`));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
