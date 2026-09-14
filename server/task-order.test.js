import assert from 'node:assert/strict';
import test from 'node:test';
import { sortTasksByStatus } from '../src/taskOrder.js';

test('sorts monitoring tasks before scheduled and stopped tasks', () => {
  const tasks = [
    { id: 'stopped', status: 'stopped' },
    { id: 'scheduled', status: 'scheduled' },
    { id: 'running', status: 'running' },
  ];

  assert.deepEqual(sortTasksByStatus(tasks).map((task) => task.id), ['running', 'scheduled', 'stopped']);
  assert.deepEqual(tasks.map((task) => task.id), ['stopped', 'scheduled', 'running']);
});

test('keeps active monitoring states together and preserves their existing order', () => {
  const tasks = [
    { id: 'scheduled', status: 'scheduled' },
    { id: 'retrying', status: 'error' },
    { id: 'running', status: 'running' },
    { id: 'triggered', status: 'triggered' },
  ];

  assert.deepEqual(sortTasksByStatus(tasks).map((task) => task.id), ['retrying', 'running', 'triggered', 'scheduled']);
});
