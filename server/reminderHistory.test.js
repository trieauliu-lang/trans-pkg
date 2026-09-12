import assert from 'node:assert/strict';
import test from 'node:test';
import { groupedReminderHistory, latestReminderAt, reminderDayKey, unreadReminderCount } from '../src/reminderHistory.js';

const tasks = [{
  id: 'task-a',
  name: '凌晨提醒',
  lastAcknowledgedTriggerAt: '2026-09-12T15:55:00.000Z',
  triggerHistory: [
    { key: 'first', message: '第一次提醒', triggeredAt: '2026-09-12T15:50:00.000Z' },
    { key: 'second', message: '第二次提醒', triggeredAt: '2026-09-12T16:05:00.000Z' },
  ],
}, {
  id: 'task-b',
  name: '早场提醒',
  triggerHistory: [{ key: 'third', message: '第三次提醒', triggeredAt: '2026-09-13T01:00:00.000Z' }],
}];

test('counts only reminders newer than the task acknowledgement', () => {
  assert.equal(unreadReminderCount(tasks[0]), 1);
  assert.equal(unreadReminderCount(tasks[1]), 1);
  assert.equal(latestReminderAt(tasks[0]), Date.parse('2026-09-12T16:05:00.000Z'));
});

test('groups all task reminders by Shanghai calendar day and sorts newest first', () => {
  assert.equal(reminderDayKey('2026-09-12T16:05:00.000Z'), '2026-09-13');
  const groups = groupedReminderHistory(tasks);
  assert.deepEqual(groups.map((group) => group.day), ['2026-09-13', '2026-09-12']);
  assert.deepEqual(groups[0].reminders.map((event) => event.taskId), ['task-b', 'task-a']);
  assert.deepEqual(groups[0].reminders.map((event) => event.unread), [true, true]);
  assert.equal(groups.flatMap((group) => group.reminders).length, 3);
});
