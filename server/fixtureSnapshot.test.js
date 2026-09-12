import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fixtureSnapshotScope,
  readFixtureSnapshot,
  removeFixtureSnapshot,
  writeFixtureSnapshot,
} from '../src/fixtureSnapshot.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test('browser fixture snapshots stay isolated by API key and provider', () => {
  const storage = memoryStorage();
  const firstScope = fixtureSnapshotScope('key-a', 'api-football');
  const secondScope = fixtureSnapshotScope('key-b', 'api-football');
  const firstFixture = [{ fixture: { id: 101 } }];
  const secondFixture = [{ fixture: { id: 202 } }];

  writeFixtureSnapshot(firstScope, '2026-09-12', firstFixture, { cache: { source: 'api' } }, storage);
  writeFixtureSnapshot(secondScope, '2026-09-12', secondFixture, { cache: { source: 'api' } }, storage);

  assert.deepEqual(readFixtureSnapshot(firstScope, storage).fixtures, firstFixture);
  assert.deepEqual(readFixtureSnapshot(secondScope, storage).fixtures, secondFixture);

  removeFixtureSnapshot(firstScope, storage);
  assert.equal(readFixtureSnapshot(firstScope, storage), null);
  assert.deepEqual(readFixtureSnapshot(secondScope, storage).fixtures, secondFixture);
});

test('legacy snapshot is claimed by only the first active key scope', () => {
  const storage = memoryStorage();
  storage.setItem('matchPulse:fixtureSnapshot:v2', JSON.stringify({
    date: '2026-09-12',
    fixtures: [{ fixture: { id: 101 } }],
    queried: true,
  }));

  const firstScope = fixtureSnapshotScope('key-a', 'api-football');
  const secondScope = fixtureSnapshotScope('key-b', 'api-football');
  assert.equal(readFixtureSnapshot(firstScope, storage).fixtures[0].fixture.id, 101);

  writeFixtureSnapshot(firstScope, '2026-09-12', [{ fixture: { id: 101 } }], {}, storage);
  assert.equal(readFixtureSnapshot(secondScope, storage), null);
});
