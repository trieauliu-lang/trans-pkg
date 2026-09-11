export function validateTask(input) {
  if (!input.name?.trim()) return '请输入任务名称';
  if (!Array.isArray(input.fixtures) || input.fixtures.length === 0) return '请至少选择一场比赛';
  if (!Number.isFinite(Number(input.intervalMinutes)) || Number(input.intervalMinutes) < 1) return '监控频次不能小于 1 分钟';
  if (input.metric !== 'home_trailing' && (!Number.isFinite(Number(input.threshold)) || Number(input.threshold) < 0)) return '阈值必须是不小于 0 的数字';
  if (input.startAt && Number.isNaN(Date.parse(input.startAt))) return '定时开始时间无效';
  return null;
}

export function normalizeTaskSettings(input, now = new Date()) {
  const startAt = input.startAt || now.toISOString();
  return {
    name: input.name.trim(),
    monitorDate: input.monitorDate || input.fixtures[0]?.fixture?.date?.slice(0, 10),
    fixtures: input.fixtures,
    intervalMinutes: Number(input.intervalMinutes),
    startAt,
    evaluateWhen: input.evaluateWhen || 'all_finished',
    matchScope: input.matchScope || 'any',
    metric: input.metric || 'total_goals',
    operator: input.operator || 'gt',
    threshold: input.metric === 'home_trailing' ? 0 : Number(input.threshold),
  };
}
