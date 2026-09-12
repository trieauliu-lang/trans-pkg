export const MIN_MONITOR_INTERVAL_MINUTES = 5;

export function normalizeMonitorInterval(value) {
  const interval = Number(value);
  return Number.isFinite(interval) ? Math.max(MIN_MONITOR_INTERVAL_MINUTES, interval) : MIN_MONITOR_INTERVAL_MINUTES;
}

export function nextMonitorCheckAt(intervalMinutes, now = Date.now()) {
  const intervalMs = normalizeMonitorInterval(intervalMinutes) * 60_000;
  return new Date(Math.ceil((now + 1) / intervalMs) * intervalMs).toISOString();
}

export function validateTask(input) {
  if (!input.name?.trim()) return '请输入任务名称';
  if (!Array.isArray(input.fixtures) || input.fixtures.length === 0) return '请至少选择一场比赛';
  if (!Number.isFinite(Number(input.intervalMinutes)) || Number(input.intervalMinutes) < MIN_MONITOR_INTERVAL_MINUTES) return '监控频次不能小于 5 分钟';
  if (Array.isArray(input.rules)) {
    if (!input.rules.length) return '请至少添加一个监控指标';
    if (input.rules.length > 20) return '单个任务最多添加 20 个监控指标';
    const fixtureIds = new Set(input.fixtures.map((fixture) => String(fixture.fixture.id)));
    const ids = new Set();
    for (const rule of input.rules) {
      const id = String(rule?.id || '');
      if (!id || ids.has(id)) return '监控指标编号无效或重复';
      ids.add(id);
      if (rule.fixtureId !== 'all' && !fixtureIds.has(String(rule.fixtureId))) return '监控指标指定的比赛不存在';
      if (rule.matchScope && !['any', 'all'].includes(rule.matchScope)) return '监控指标的多场范围无效';
      if (!['in_play', 'halftime', 'each_finished', 'all_finished'].includes(rule.evaluateWhen)) return '监控指标的判断时机无效';
      if (!['total_goals', 'goal_difference', 'home_leading', 'home_trailing'].includes(rule.metric)) return '监控指标类型无效';
      if (!['home_leading', 'home_trailing'].includes(rule.metric)
        && (!['gt', 'gte', 'eq', 'lt', 'lte'].includes(rule.operator) || !Number.isFinite(Number(rule.threshold)) || Number(rule.threshold) < 0)) {
        return '监控指标的比较条件无效';
      }
    }
  } else if (input.metric !== 'home_trailing' && (!Number.isFinite(Number(input.threshold)) || Number(input.threshold) < 0)) {
    return '阈值必须是不小于 0 的数字';
  }
  if (input.startAt && Number.isNaN(Date.parse(input.startAt))) return '定时开始时间无效';
  return null;
}

export function normalizeTaskSettings(input, now = new Date()) {
  const startAt = input.startAt || now.toISOString();
  const ruleInputs = Array.isArray(input.rules) && input.rules.length ? input.rules : [{
    id: 'legacy', fixtureId: 'all', evaluateWhen: input.evaluateWhen || 'all_finished',
    matchScope: input.matchScope || 'any', metric: input.metric || 'total_goals',
    operator: input.operator || 'gt', threshold: input.threshold,
  }];
  const rules = ruleInputs.map((rule, index) => ({
    id: String(rule.id || `rule-${index + 1}`).slice(0, 64),
    fixtureId: rule.fixtureId === 'all' ? 'all' : String(rule.fixtureId),
    evaluateWhen: rule.evaluateWhen || 'in_play',
    metric: rule.metric || 'total_goals',
    operator: ['home_leading', 'home_trailing'].includes(rule.metric) ? (rule.metric === 'home_leading' ? 'gt' : 'lt') : rule.operator || 'gt',
    threshold: ['home_leading', 'home_trailing'].includes(rule.metric) ? 0 : Number(rule.threshold),
    ...(rule.matchScope ? { matchScope: rule.matchScope } : {}),
  }));
  const firstRule = rules[0];
  return {
    name: input.name.trim(),
    monitorDate: input.monitorDate || input.fixtures[0]?.fixture?.date?.slice(0, 10),
    fixtures: input.fixtures,
    intervalMinutes: normalizeMonitorInterval(input.intervalMinutes),
    startAt,
    rules,
    evaluateWhen: firstRule.evaluateWhen,
    matchScope: input.matchScope || 'any',
    metric: firstRule.metric,
    operator: firstRule.operator,
    threshold: firstRule.threshold,
  };
}
