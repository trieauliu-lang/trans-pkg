export const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN']);
export const TERMINAL_STATUSES = new Set(['FT', 'AET', 'PEN', 'CANC', 'ABD', 'AWD', 'WO', 'PST', 'SUSP']);
export const HALFTIME_REACHED_STATUSES = new Set(['HT', '2H', 'ET', 'BT', 'P', 'FT', 'AET', 'PEN']);

const TERMINAL_STATUS_LABELS = {
  CANC: '比赛取消', ABD: '比赛腰斩', AWD: '裁定赛果', WO: '弃权', PST: '比赛延期', SUSP: '比赛暂停',
};

export function terminalTaskMessage(fixtures) {
  const abnormal = fixtures.filter((fixture) => TERMINAL_STATUS_LABELS[fixture.fixture.status.short]);
  if (!abnormal.length) return '所选比赛已全部结束，监控完成';
  const details = abnormal.map((fixture) => `${fixture.teams.home.name} vs ${fixture.teams.away.name}：${TERMINAL_STATUS_LABELS[fixture.fixture.status.short]}`).join('；');
  return `所选比赛均已终止，监控自动停止。${details}`;
}

export function compare(actual, operator, expected) {
  const operations = {
    gt: (a, b) => a > b,
    gte: (a, b) => a >= b,
    eq: (a, b) => a === b,
    lt: (a, b) => a < b,
    lte: (a, b) => a <= b,
  };
  return Boolean(operations[operator]?.(actual, expected));
}

export function evaluateTask(task, fixtures) {
  if (!fixtures.length) return { matched: false, reason: '暂无比赛数据' };

  const finished = fixtures.filter((item) => FINISHED_STATUSES.has(item.fixture.status.short));
  if (task.evaluateWhen === 'all_finished' && finished.length !== fixtures.length) {
    return { matched: false, reason: `等待完场 ${finished.length}/${fixtures.length}` };
  }

  const halftimeReached = fixtures.filter((item) => HALFTIME_REACHED_STATUSES.has(item.fixture.status.short));
  if (task.evaluateWhen === 'halftime' && task.matchScope === 'all' && halftimeReached.length !== fixtures.length) {
    return { matched: false, reason: `等待比赛进入半场后 ${halftimeReached.length}/${fixtures.length}` };
  }

  const candidates = task.evaluateWhen === 'each_finished'
    ? finished
    : task.evaluateWhen === 'halftime' ? halftimeReached : fixtures;
  if (!candidates.length) {
    return { matched: false, reason: task.evaluateWhen === 'halftime' ? '等待比赛进入半场后' : '等待首场比赛完场' };
  }

  const checks = candidates.map((item) => {
    const hasScore = item.goals.home != null && item.goals.away != null;
    const home = Number(item.goals.home ?? 0);
    const away = Number(item.goals.away ?? 0);
    if (task.metric === 'home_trailing') {
      return { item, actual: home - away, pass: hasScore && home < away };
    }
    const actual = task.metric === 'goal_difference' ? Math.abs(home - away) : home + away;
    return { item, actual, pass: compare(actual, task.operator, task.threshold) };
  });

  const matched = task.matchScope === 'all' ? checks.every((item) => item.pass) : checks.some((item) => item.pass);
  const hit = checks.find((item) => item.pass) ?? checks[0];
  const homeName = hit.item.teams.home.name;
  const awayName = hit.item.teams.away.name;
  const score = `${hit.item.goals.home ?? '-'}–${hit.item.goals.away ?? '-'}`;

  return {
    matched,
    reason: task.metric === 'home_trailing'
      ? matched
        ? `${homeName} ${score} ${awayName}，半场后主队落后，触发提醒`
        : `${homeName} ${score} ${awayName}，半场后主队当前未落后`
      : matched
        ? `${homeName} ${score} ${awayName}，检测值 ${hit.actual}`
        : `条件未满足，最近检测值 ${hit.actual}`,
    fixtureId: hit.item.fixture.id,
  };
}

const BEFORE_PLAY_STATUSES = new Set(['NS', 'TBD', 'PST', 'CANC', 'ABD', 'SUSP']);

function taskRules(task) {
  if (Array.isArray(task.rules) && task.rules.length) return task.rules;
  return [{
    id: 'legacy', fixtureId: 'all', evaluateWhen: task.evaluateWhen || 'all_finished',
    matchScope: task.matchScope || 'any', metric: task.metric || 'total_goals',
    operator: task.operator || 'gt', threshold: Number(task.threshold) || 0,
  }];
}

export function taskMonitoringComplete(task, fixtures) {
  if (!fixtures.length) return false;
  if (fixtures.every((fixture) => TERMINAL_STATUSES.has(fixture.fixture.status.short))) return true;

  const rules = taskRules(task);
  return rules.length > 0 && rules.every((rule) => {
    if (rule.metric !== 'home_trailing') return false;
    const targets = rule.fixtureId && rule.fixtureId !== 'all'
      ? fixtures.filter((fixture) => String(fixture.fixture.id) === String(rule.fixtureId))
      : fixtures;
    return targets.length > 0 && targets.every((fixture) => TERMINAL_STATUSES.has(fixture.fixture.status.short));
  });
}

function ruleCandidates(rule, fixtures) {
  const targets = rule.fixtureId && rule.fixtureId !== 'all'
    ? fixtures.filter((fixture) => String(fixture.fixture.id) === String(rule.fixtureId))
    : fixtures;
  if (rule.evaluateWhen === 'all_finished') {
    return fixtures.every((fixture) => FINISHED_STATUSES.has(fixture.fixture.status.short)) ? targets : [];
  }
  if (rule.evaluateWhen === 'each_finished') {
    return targets.filter((fixture) => FINISHED_STATUSES.has(fixture.fixture.status.short));
  }
  if (rule.evaluateWhen === 'halftime') {
    return targets.filter((fixture) => HALFTIME_REACHED_STATUSES.has(fixture.fixture.status.short));
  }
  return targets.filter((fixture) => !BEFORE_PLAY_STATUSES.has(fixture.fixture.status.short));
}

function checkRule(rule, item) {
  const hasScore = item.goals.home != null && item.goals.away != null;
  const home = Number(item.goals.home ?? 0);
  const away = Number(item.goals.away ?? 0);
  if (!hasScore || !Number.isFinite(home) || !Number.isFinite(away)) return { pass: false, actual: null };
  if (rule.metric === 'home_leading') return { pass: home > away, actual: home - away };
  if (rule.metric === 'home_trailing') return { pass: home < away, actual: home - away };
  const actual = rule.metric === 'goal_difference' ? Math.abs(home - away) : home + away;
  return { pass: compare(actual, rule.operator, Number(rule.threshold)), actual };
}

function matchMessage(rule, item, actual) {
  const homeName = item.teams.home.name;
  const awayName = item.teams.away.name;
  const score = `${item.goals.home ?? '-'}–${item.goals.away ?? '-'}`;
  if (rule.metric === 'home_leading') return `${homeName} ${score} ${awayName}，主队领先客队`;
  if (rule.metric === 'home_trailing') return `${homeName} ${score} ${awayName}，主队落后客队`;
  return `${homeName} ${score} ${awayName}，检测值 ${actual}`;
}

export function evaluateTaskRules(task, fixtures, triggeredRuleKeys = []) {
  if (!fixtures.length) return { matches: [], reason: '暂无比赛数据' };
  const triggered = new Set(triggeredRuleKeys);
  const matches = [];
  let eligibleCount = 0;

  taskRules(task).forEach((rule, index) => {
    const normalizedRule = { ...rule, id: String(rule.id || `rule-${index + 1}`) };
    const targets = normalizedRule.fixtureId && normalizedRule.fixtureId !== 'all'
      ? fixtures.filter((fixture) => String(fixture.fixture.id) === String(normalizedRule.fixtureId))
      : fixtures;
    const candidates = ruleCandidates(normalizedRule, fixtures);
    eligibleCount += candidates.length;
    const checks = candidates.map((item) => ({ item, ...checkRule(normalizedRule, item) }));

    if (normalizedRule.matchScope === 'all') {
      const key = `${normalizedRule.id}:all`;
      if (!triggered.has(key) && checks.length === targets.length && checks.length > 0 && checks.every((check) => check.pass)) {
        const hit = checks[0];
        matches.push({ key, ruleId: normalizedRule.id, fixtureId: hit.item.fixture.id, message: matchMessage(normalizedRule, hit.item, hit.actual) });
      }
      return;
    }

    checks.filter((check) => check.pass).forEach((hit) => {
      const key = `${normalizedRule.id}:${hit.item.fixture.id}`;
      if (!triggered.has(key)) {
        matches.push({ key, ruleId: normalizedRule.id, fixtureId: hit.item.fixture.id, message: matchMessage(normalizedRule, hit.item, hit.actual) });
      }
    });
  });

  return {
    matches,
    reason: matches.length
      ? `${matches.length} 个新条件已满足：${matches.map((match) => match.message).join('；')}`
      : eligibleCount ? '持续监控中，暂无新的指标满足' : '等待比赛进入规则判断阶段',
  };
}
