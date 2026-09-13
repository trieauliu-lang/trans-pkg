export const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN']);
export const TERMINAL_STATUSES = new Set(['FT', 'AET', 'PEN', 'CANC', 'ABD', 'AWD', 'WO', 'PST', 'SUSP']);
export const HALFTIME_REACHED_STATUSES = new Set(['HT']);
export const HALFTIME_PASSED_STATUSES = new Set(['2H', 'ET', 'BT', 'P', 'FT', 'AET', 'PEN']);

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

function validScorePair(score) {
  const home = Number(score?.home);
  const away = Number(score?.away);
  return score?.home != null && score?.away != null
    && Number.isFinite(home) && Number.isFinite(away) && home >= 0 && away >= 0;
}

function halftimeSnapshot(item) {
  const status = item.fixture.status.short;
  const score = HALFTIME_REACHED_STATUSES.has(status)
    ? item.goals
    : HALFTIME_PASSED_STATUSES.has(status) ? item.score?.halftime : null;
  if (!validScorePair(score)) return null;
  return { ...item, goals: { home: Number(score.home), away: Number(score.away) } };
}

export function evaluateTask(task, fixtures) {
  if (!fixtures.length) return { matched: false, reason: '暂无比赛数据' };

  const finished = fixtures.filter((item) => FINISHED_STATUSES.has(item.fixture.status.short));
  if (task.evaluateWhen === 'all_finished' && finished.length !== fixtures.length) {
    return { matched: false, reason: `等待完场 ${finished.length}/${fixtures.length}` };
  }

  const halftimeReached = fixtures.map(halftimeSnapshot).filter(Boolean);
  const halftimePassed = fixtures.filter((item) => HALFTIME_PASSED_STATUSES.has(item.fixture.status.short));
  if (task.evaluateWhen === 'halftime' && task.matchScope === 'all' && halftimeReached.length !== fixtures.length) {
    return { matched: false, reason: halftimePassed.length
      ? `等待接口提供半场比分后补判（已取得 ${halftimeReached.length}/${fixtures.length}）`
      : `等待上半场结束并进入中场 ${halftimeReached.length}/${fixtures.length}` };
  }

  const candidates = task.evaluateWhen === 'each_finished'
    ? finished
    : task.evaluateWhen === 'halftime' ? halftimeReached : fixtures;
  if (!candidates.length) {
    return { matched: false, reason: task.evaluateWhen === 'halftime'
      ? halftimePassed.length ? '已进入下半场，等待接口提供半场比分后补判' : '等待上半场结束并进入中场'
      : '等待首场比赛完场' };
  }

  const checks = candidates.map((item) => {
    const home = Number(item.goals.home ?? 0);
    const away = Number(item.goals.away ?? 0);
    const hasScore = item.goals.home != null && item.goals.away != null
      && Number.isFinite(home) && Number.isFinite(away) && home >= 0 && away >= 0;
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
        ? `${homeName} ${score} ${awayName}，中场时主队落后，触发提醒`
        : `${homeName} ${score} ${awayName}，中场时主队未落后，不提醒`
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
  const completed = new Set(task.completedRuleKeys || []);
  return rules.length > 0 && rules.every((rule) => {
    const targets = rule.fixtureId && rule.fixtureId !== 'all'
      ? fixtures.filter((fixture) => String(fixture.fixture.id) === String(rule.fixtureId))
      : fixtures;
    if (!targets.length) return false;
    if (rule.evaluateWhen === 'halftime') {
      const expectedKeys = rule.matchScope === 'all'
        ? [`${rule.id}:all`]
        : targets.map((fixture) => `${rule.id}:${fixture.fixture.id}`);
      return expectedKeys.every((key) => completed.has(key));
    }
    if (rule.evaluateWhen === 'all_finished') {
      return fixtures.every((fixture) => TERMINAL_STATUSES.has(fixture.fixture.status.short));
    }
    return targets.every((fixture) => TERMINAL_STATUSES.has(fixture.fixture.status.short));
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
  if (!hasScore || !Number.isFinite(home) || !Number.isFinite(away) || home < 0 || away < 0) return { pass: false, actual: null };
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

export function evaluateTaskRules(task, fixtures, triggeredRuleKeys = [], completedRuleKeys = []) {
  if (!fixtures.length) return { matches: [], completedRuleKeys: [...completedRuleKeys], reason: '暂无比赛数据' };
  const triggered = new Set(triggeredRuleKeys);
  const completed = new Set(completedRuleKeys);
  const matches = [];
  let eligibleCount = 0;
  let halftimeEvaluated = 0;
  let halftimeMissed = 0;
  let halftimePendingBackfill = 0;
  let halftimeWaiting = 0;

  taskRules(task).forEach((rule, index) => {
    const normalizedRule = { ...rule, id: String(rule.id || `rule-${index + 1}`) };
    const targets = normalizedRule.fixtureId && normalizedRule.fixtureId !== 'all'
      ? fixtures.filter((fixture) => String(fixture.fixture.id) === String(normalizedRule.fixtureId))
      : fixtures;

    if (normalizedRule.evaluateWhen === 'halftime') {
      if (normalizedRule.matchScope === 'all') {
        const key = `${normalizedRule.id}:all`;
        if (completed.has(key)) return;
        const halftimeTargets = targets.map(halftimeSnapshot);
        const allHaveHalftimeScores = halftimeTargets.length > 0 && halftimeTargets.every(Boolean);
        const allTerminal = targets.length > 0 && targets.every((item) => TERMINAL_STATUSES.has(item.fixture.status.short));
        if (allHaveHalftimeScores) {
          const checks = halftimeTargets.map((item) => ({ item, ...checkRule(normalizedRule, item) }));
          completed.add(key);
          halftimeEvaluated += checks.length;
          eligibleCount += checks.length;
          if (!triggered.has(key) && checks.every((check) => check.pass)) {
            const hit = checks[0];
            matches.push({ key, ruleId: normalizedRule.id, fixtureId: hit.item.fixture.id, message: matchMessage(normalizedRule, hit.item, hit.actual) });
          }
        } else if (allTerminal) {
          completed.add(key);
          halftimeMissed += 1;
        } else if (targets.some((item) => HALFTIME_REACHED_STATUSES.has(item.fixture.status.short)
          || HALFTIME_PASSED_STATUSES.has(item.fixture.status.short))) {
          halftimePendingBackfill += 1;
        } else {
          halftimeWaiting += 1;
        }
        return;
      }

      targets.forEach((item) => {
        const key = `${normalizedRule.id}:${item.fixture.id}`;
        if (completed.has(key)) return;
        const status = item.fixture.status.short;
        const halftimeItem = halftimeSnapshot(item);
        if (halftimeItem) {
          const check = { item: halftimeItem, ...checkRule(normalizedRule, halftimeItem) };
          completed.add(key);
          halftimeEvaluated += 1;
          eligibleCount += 1;
          if (!triggered.has(key) && check.pass) {
            matches.push({ key, ruleId: normalizedRule.id, fixtureId: item.fixture.id, message: matchMessage(normalizedRule, halftimeItem, check.actual) });
          }
        } else if (TERMINAL_STATUSES.has(status)) {
          completed.add(key);
          halftimeMissed += 1;
        } else if (HALFTIME_REACHED_STATUSES.has(status) || HALFTIME_PASSED_STATUSES.has(status)) {
          halftimePendingBackfill += 1;
        } else {
          halftimeWaiting += 1;
        }
      });
      return;
    }

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
    completedRuleKeys: [...completed],
    reason: matches.length
      ? `${matches.length} 个新条件已满足：${matches.map((match) => match.message).join('；')}`
      : halftimeMissed ? '比赛已经结束，但接口未提供可用半场比分，无法补判'
        : halftimePendingBackfill ? '比赛已到中场或下半场，等待接口提供半场比分后补判'
        : halftimeWaiting ? '仍有比赛尚未进入中场，继续监控'
        : halftimeEvaluated ? '已按中场比分判断，条件未满足，不提醒'
          : eligibleCount ? '持续监控中，暂无新的指标满足' : '等待比赛进入规则判断阶段',
  };
}
