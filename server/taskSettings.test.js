import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeTaskSettings, validateTask } from './taskSettings.js';

const fixture = {
  fixture: { id: 1549016, date: '2026-09-12T01:00:00+08:00' },
  teams: { home: { name: 'FC Copenhagen' }, away: { name: 'AC Horsens' } },
};

test('normalizes editable task settings without changing fixture identity', () => {
  const settings = normalizeTaskSettings({
    name: '  丹麦比赛提醒  ',
    fixtures: [fixture],
    intervalMinutes: '5',
    startAt: '2026-09-11T16:30:00.000Z',
    evaluateWhen: 'each_finished',
    matchScope: 'all',
    metric: 'goal_difference',
    operator: 'gte',
    threshold: '3',
  });

  assert.equal(settings.name, '丹麦比赛提醒');
  assert.equal(settings.monitorDate, '2026-09-12');
  assert.equal(settings.fixtures[0].fixture.id, 1549016);
  assert.equal(settings.intervalMinutes, 5);
  assert.equal(settings.threshold, 3);
});

test('reuses the same validation for task creation and repeated edits', () => {
  assert.equal(validateTask({ name: '', fixtures: [fixture], intervalMinutes: 3, threshold: 2 }), '请输入任务名称');
  assert.equal(validateTask({ name: '提醒', fixtures: [fixture], intervalMinutes: 0, threshold: 2 }), '监控频次不能小于 1 分钟');
  assert.equal(validateTask({ name: '提醒', fixtures: [fixture], intervalMinutes: 3, threshold: 2 }), null);
});

test('home trailing rule does not require a numeric threshold', () => {
  const input = {
    name: '半场主队落后提醒', fixtures: [fixture], intervalMinutes: 3,
    evaluateWhen: 'halftime', matchScope: 'any', metric: 'home_trailing', threshold: '',
  };
  assert.equal(validateTask(input), null);
  const settings = normalizeTaskSettings(input);
  assert.equal(settings.evaluateWhen, 'halftime');
  assert.equal(settings.metric, 'home_trailing');
  assert.equal(settings.threshold, 0);
});
