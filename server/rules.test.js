import test from 'node:test';
import assert from 'node:assert/strict';
import { compare, evaluateTask } from './rules.js';

const fixture = (id, status, home, away) => ({
  fixture: { id, status: { short: status } },
  teams: { home: { name: `主队${id}` }, away: { name: `客队${id}` } },
  goals: { home, away },
});

test('比较运算支持常用操作符', () => {
  assert.equal(compare(3, 'gt', 2), true);
  assert.equal(compare(2, 'gte', 2), true);
  assert.equal(compare(2, 'lt', 2), false);
});

test('全部完场后，任意一场总进球大于阈值时触发', () => {
  const task = { evaluateWhen: 'all_finished', matchScope: 'any', metric: 'total_goals', operator: 'gt', threshold: 2 };
  const result = evaluateTask(task, [fixture(1, 'FT', 2, 1), fixture(2, 'FT', 1, 0)]);
  assert.equal(result.matched, true);
  assert.equal(result.fixtureId, 1);
});

test('存在未完场比赛时继续等待', () => {
  const task = { evaluateWhen: 'all_finished', matchScope: 'any', metric: 'total_goals', operator: 'gt', threshold: 2 };
  const result = evaluateTask(task, [fixture(1, 'FT', 2, 1), fixture(2, '2H', 1, 0)]);
  assert.equal(result.matched, false);
  assert.match(result.reason, /等待完场/);
});

test('半场后主队落后客队时触发提醒', () => {
  const task = { evaluateWhen: 'halftime', matchScope: 'any', metric: 'home_trailing', operator: 'lt', threshold: 0 };
  const result = evaluateTask(task, [fixture(1, 'HT', 0, 1)]);
  assert.equal(result.matched, true);
  assert.equal(result.fixtureId, 1);
  assert.match(result.reason, /半场后主队落后/);
});

test('上半场尚未结束时不判断主队落后条件', () => {
  const task = { evaluateWhen: 'halftime', matchScope: 'any', metric: 'home_trailing', operator: 'lt', threshold: 0 };
  const result = evaluateTask(task, [fixture(1, '1H', 0, 2)]);
  assert.equal(result.matched, false);
  assert.match(result.reason, /等待比赛进入半场后/);
});

test('错过短暂中场状态后可在下半场继续判断', () => {
  const task = { evaluateWhen: 'halftime', matchScope: 'any', metric: 'home_trailing', operator: 'lt', threshold: 0 };
  assert.equal(evaluateTask(task, [fixture(1, '2H', 1, 2)]).matched, true);
  assert.equal(evaluateTask(task, [fixture(1, '2H', 2, 2)]).matched, false);
});

test('选择全部比赛时等待所有比赛进入半场后', () => {
  const task = { evaluateWhen: 'halftime', matchScope: 'all', metric: 'home_trailing', operator: 'lt', threshold: 0 };
  const result = evaluateTask(task, [fixture(1, 'HT', 0, 1), fixture(2, '1H', 0, 1)]);
  assert.equal(result.matched, false);
  assert.match(result.reason, /1\/2/);
});
