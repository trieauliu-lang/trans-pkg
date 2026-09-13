import test from 'node:test';
import assert from 'node:assert/strict';
import { compare, evaluateTask, evaluateTaskRules, taskMonitoringComplete, terminalTaskMessage, TERMINAL_STATUSES } from './rules.js';

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

test('仅在明确中场状态下主队落后客队时触发提醒', () => {
  const task = { evaluateWhen: 'halftime', matchScope: 'any', metric: 'home_trailing', operator: 'lt', threshold: 0 };
  const result = evaluateTask(task, [fixture(1, 'HT', 0, 1)]);
  assert.equal(result.matched, true);
  assert.equal(result.fixtureId, 1);
  assert.match(result.reason, /中场时主队落后/);
});

test('上半场尚未结束时不判断主队落后条件', () => {
  const task = { evaluateWhen: 'halftime', matchScope: 'any', metric: 'home_trailing', operator: 'lt', threshold: 0 };
  const result = evaluateTask(task, [fixture(1, '1H', 0, 2)]);
  assert.equal(result.matched, false);
  assert.match(result.reason, /等待上半场结束并进入中场/);
});

test('错过明确中场状态后不使用下半场比分补判', () => {
  const task = { evaluateWhen: 'halftime', matchScope: 'any', metric: 'home_trailing', operator: 'lt', threshold: 0 };
  const result = evaluateTask(task, [fixture(1, '2H', 1, 2)]);
  assert.equal(result.matched, false);
  assert.match(result.reason, /不使用下半场或赛后比分补判/);
});

test('选择全部比赛时等待所有比赛进入半场后', () => {
  const task = { evaluateWhen: 'halftime', matchScope: 'all', metric: 'home_trailing', operator: 'lt', threshold: 0 };
  const result = evaluateTask(task, [fixture(1, 'HT', 0, 1), fixture(2, '1H', 0, 1)]);
  assert.equal(result.matched, false);
  assert.match(result.reason, /1\/2/);
});

test('multiple rules trigger independently and already triggered rules do not repeat', () => {
  const task = { rules: [
    { id: 'half-lead', fixtureId: 'all', evaluateWhen: 'halftime', metric: 'home_leading' },
    { id: 'goals', fixtureId: 'all', evaluateWhen: 'in_play', metric: 'total_goals', operator: 'gt', threshold: 2 },
  ] };
  const halftime = evaluateTaskRules(task, [fixture(1, 'HT', 1, 0)]);
  assert.deepEqual(halftime.matches.map((match) => match.key), ['half-lead:1']);

  const secondHalf = evaluateTaskRules(task, [fixture(1, '2H', 2, 1)], ['half-lead:1']);
  assert.deepEqual(secondHalf.matches.map((match) => match.key), ['goals:1']);

  const repeated = evaluateTaskRules(task, [fixture(1, '2H', 3, 1)], ['half-lead:1', 'goals:1']);
  assert.equal(repeated.matches.length, 0);
});

test('中场条件未满足也只判断一次并完成该规则', () => {
  const task = { rules: [
    { id: 'trailing', fixtureId: '1', evaluateWhen: 'halftime', metric: 'home_trailing' },
    { id: 'goals', fixtureId: '2', evaluateWhen: 'in_play', metric: 'total_goals', operator: 'gt', threshold: 5 },
  ] };
  const first = evaluateTaskRules(task, [fixture(1, 'HT', 1, 1), fixture(2, '1H', 0, 0)]);
  assert.equal(first.matches.length, 0);
  assert.deepEqual(first.completedRuleKeys, ['trailing:1']);
  assert.match(first.reason, /条件未满足/);

  const correctedLater = evaluateTaskRules(
    task,
    [fixture(1, 'HT', 1, 2), fixture(2, '1H', 0, 0)],
    [],
    first.completedRuleKeys,
  );
  assert.equal(correctedLater.matches.length, 0);
});

test('直接看到下半场时标记中场规则已完成但不触发', () => {
  const task = { rules: [{ id: 'trailing', fixtureId: '1', evaluateWhen: 'halftime', metric: 'home_trailing' }] };
  const result = evaluateTaskRules(task, [fixture(1, '2H', 0, 2)]);
  assert.equal(result.matches.length, 0);
  assert.deepEqual(result.completedRuleKeys, ['trailing:1']);
  assert.match(result.reason, /不补判/);
});

test('中场比分必须是非负有限数字才允许判断', () => {
  const task = { rules: [{ id: 'trailing', fixtureId: '1', evaluateWhen: 'halftime', metric: 'home_trailing' }] };
  const result = evaluateTaskRules(task, [fixture(1, 'HT', -1, 2)]);
  assert.equal(result.matches.length, 0);
  assert.deepEqual(result.completedRuleKeys, ['trailing:1']);
});

test('a rule can target one fixture while an all-fixtures rule triggers once per match', () => {
  const task = { rules: [
    { id: 'targeted', fixtureId: '2', evaluateWhen: 'in_play', metric: 'total_goals', operator: 'gte', threshold: 1 },
    { id: 'all-games', fixtureId: 'all', evaluateWhen: 'halftime', metric: 'home_trailing' },
  ] };
  const result = evaluateTaskRules(task, [fixture(1, 'HT', 0, 1), fixture(2, 'HT', 0, 2)]);
  assert.deepEqual(new Set(result.matches.map((match) => match.key)), new Set(['targeted:2', 'all-games:1', 'all-games:2']));
});

test('in-play rules wait until kickoff and can still catch a condition at full time', () => {
  const task = { rules: [{ id: 'goals', fixtureId: 'all', evaluateWhen: 'in_play', metric: 'total_goals', operator: 'gt', threshold: 2 }] };
  assert.equal(evaluateTaskRules(task, [fixture(1, 'NS', null, null)]).matches.length, 0);
  assert.equal(evaluateTaskRules(task, [fixture(1, 'FT', 2, 1)]).matches.length, 1);
});

test('cancelled, abandoned, awarded, walkover, postponed and suspended matches are terminal', () => {
  ['CANC', 'ABD', 'AWD', 'WO', 'PST', 'SUSP'].forEach((status) => assert.equal(TERMINAL_STATUSES.has(status), true));
  const cancelled = fixture(9, 'CANC', 0, 0);
  assert.match(terminalTaskMessage([cancelled]), /比赛取消/);
});

test('中场规则在目标到达或越过中场时停止', () => {
  const targeted = { rules: [{ id: 'trailing', fixtureId: '1', evaluateWhen: 'halftime', metric: 'home_trailing' }] };
  assert.equal(taskMonitoringComplete(targeted, [fixture(1, 'FT', 1, 2), fixture(2, '2H', 0, 0)]), true);

  const allFixtures = { rules: [{ id: 'trailing', fixtureId: 'all', evaluateWhen: 'halftime', metric: 'home_trailing' }] };
  assert.equal(taskMonitoringComplete(allFixtures, [fixture(1, 'FT', 1, 2), fixture(2, '2H', 0, 0)]), true);
  assert.equal(taskMonitoringComplete(allFixtures, [fixture(1, 'FT', 1, 2), fixture(2, 'FT', 0, 0)]), true);
});

test('a completed home-trailing rule does not stop unrelated active rules', () => {
  const task = { rules: [
    { id: 'trailing', fixtureId: '1', evaluateWhen: 'halftime', metric: 'home_trailing' },
    { id: 'goals', fixtureId: '2', evaluateWhen: 'in_play', metric: 'total_goals', operator: 'gt', threshold: 2 },
  ] };
  assert.equal(taskMonitoringComplete(task, [fixture(1, 'FT', 1, 2), fixture(2, '2H', 1, 1)]), false);
});
