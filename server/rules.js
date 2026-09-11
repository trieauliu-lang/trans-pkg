export const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN']);

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

  const candidates = task.evaluateWhen === 'each_finished' ? finished : fixtures;
  if (!candidates.length) return { matched: false, reason: '等待首场比赛完场' };

  const checks = candidates.map((item) => {
    const home = Number(item.goals.home ?? 0);
    const away = Number(item.goals.away ?? 0);
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
    reason: matched
      ? `${homeName} ${score} ${awayName}，检测值 ${hit.actual}`
      : `条件未满足，最近检测值 ${hit.actual}`,
    fixtureId: hit.item.fixture.id,
  };
}
