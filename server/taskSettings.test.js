import assert from 'node:assert/strict';
import test from 'node:test';
import { nextMonitorCheckAt, normalizeMonitorInterval, normalizeTaskSettings, quotaAwareMonitorInterval, validateTask } from './taskSettings.js';

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
  assert.equal(settings.rules[0].metric, 'goal_difference');
});

test('reuses the same validation for task creation and repeated edits', () => {
  assert.equal(validateTask({ name: '', fixtures: [fixture], intervalMinutes: 5, threshold: 2 }), '请输入任务名称');
  assert.equal(validateTask({ name: '提醒', fixtures: [fixture], intervalMinutes: 3, threshold: 2 }), '监控频次不能小于 5 分钟');
  assert.equal(validateTask({ name: '提醒', fixtures: [fixture], intervalMinutes: 5, threshold: 2 }), null);
});

test('migrates short intervals to five minutes and aligns shared checks', () => {
  assert.equal(normalizeMonitorInterval(3), 5);
  assert.equal(normalizeMonitorInterval(10), 10);
  assert.equal(nextMonitorCheckAt(3, Date.parse('2026-09-12T00:02:12.000Z')), '2026-09-12T00:05:00.000Z');
  assert.equal(nextMonitorCheckAt(5, Date.parse('2026-09-12T00:02:12.000Z')), '2026-09-12T00:05:00.000Z');
});

test('slows shared monitoring to at least ten minutes below 25 remaining requests', () => {
  assert.equal(quotaAwareMonitorInterval(5, { remaining: 24 }), 10);
  assert.equal(quotaAwareMonitorInterval(5, { remaining: '0' }), 10);
  assert.equal(quotaAwareMonitorInterval(5, { remaining: 25 }), 5);
  assert.equal(quotaAwareMonitorInterval(15, { remaining: 24 }), 15);
  assert.equal(quotaAwareMonitorInterval(5, { remaining: null }), 5);
});

test('home trailing rule does not require a numeric threshold', () => {
  const input = {
    name: '半场主队落后提醒', fixtures: [fixture], intervalMinutes: 5,
    evaluateWhen: 'halftime', matchScope: 'any', metric: 'home_trailing', threshold: '',
  };
  assert.equal(validateTask(input), null);
  const settings = normalizeTaskSettings(input);
  assert.equal(settings.evaluateWhen, 'halftime');
  assert.equal(settings.metric, 'home_trailing');
  assert.equal(settings.threshold, 0);
});

test('validates and normalizes multiple per-fixture monitoring rules', () => {
  const input = {
    name: '多指标提醒', fixtures: [fixture], intervalMinutes: 5,
    rules: [
      { id: 'half-lead', fixtureId: '1549016', evaluateWhen: 'halftime', metric: 'home_leading' },
      { id: 'goals', fixtureId: 'all', evaluateWhen: 'in_play', metric: 'total_goals', operator: 'gt', threshold: '2' },
    ],
  };
  assert.equal(validateTask(input), null);
  const settings = normalizeTaskSettings(input);
  assert.equal(settings.rules.length, 2);
  assert.deepEqual(settings.rules[0], {
    id: 'half-lead', fixtureId: '1549016', evaluateWhen: 'halftime',
    metric: 'home_leading', operator: 'gt', threshold: 0,
  });
  assert.equal(settings.rules[1].threshold, 2);
});

test('rejects empty, duplicate and invalid rule targets', () => {
  const base = { name: '提醒', fixtures: [fixture], intervalMinutes: 5 };
  assert.match(validateTask({ ...base, rules: [] }), /至少添加/);
  const duplicate = { id: 'same', fixtureId: 'all', evaluateWhen: 'in_play', metric: 'home_leading' };
  assert.match(validateTask({ ...base, rules: [duplicate, duplicate] }), /重复/);
  assert.match(validateTask({ ...base, rules: [{ ...duplicate, id: 'other', fixtureId: 'missing' }] }), /比赛不存在/);
});
