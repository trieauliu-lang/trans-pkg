const TASK_STATUS_PRIORITY = {
  running: 0,
  triggered: 0,
  error: 0,
  scheduled: 1,
  stopped: 2,
};

export function sortTasksByStatus(tasks = []) {
  return [...tasks].sort((left, right) => (
    (TASK_STATUS_PRIORITY[left.status] ?? 3) - (TASK_STATUS_PRIORITY[right.status] ?? 3)
  ));
}
