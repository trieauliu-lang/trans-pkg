const SHANGHAI_TIME_ZONE = 'Asia/Shanghai';

export function reminderDayKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SHANGHAI_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function latestReminderAt(task) {
  const history = Array.isArray(task?.triggerHistory) ? task.triggerHistory : [];
  return history.reduce((latest, event) => {
    const timestamp = Date.parse(event?.triggeredAt);
    return Number.isFinite(timestamp) && timestamp > latest ? timestamp : latest;
  }, 0);
}

export function unreadReminderCount(task) {
  const acknowledgedAt = Date.parse(task?.lastAcknowledgedTriggerAt || 0) || 0;
  return (task?.triggerHistory || []).filter((event) => {
    const triggeredAt = Date.parse(event?.triggeredAt);
    return Number.isFinite(triggeredAt) && triggeredAt > acknowledgedAt;
  }).length;
}

export function groupedReminderHistory(tasks) {
  const events = (tasks || []).flatMap((task) => {
    const acknowledgedAt = Date.parse(task.lastAcknowledgedTriggerAt || 0) || 0;
    return (task.triggerHistory || []).map((event, index) => ({
      ...event,
      taskId: task.id,
      taskName: task.name,
      unread: (Date.parse(event.triggeredAt) || 0) > acknowledgedAt,
      reminderId: `${task.id}:${event.key || event.ruleId || index}:${event.triggeredAt || index}`,
    }));
  }).sort((left, right) => Date.parse(right.triggeredAt) - Date.parse(left.triggeredAt));

  const groups = new Map();
  events.forEach((event) => {
    const day = reminderDayKey(event.triggeredAt);
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day).push(event);
  });
  return [...groups].map(([day, reminders]) => ({ day, reminders }));
}
