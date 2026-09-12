import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlarmClock,
  BellRing,
  CalendarDays,
  Check,
  ChevronRight,
  CircleStop,
  Clock3,
  CloudCog,
  Headphones,
  KeyRound,
  LoaderCircle,
  Music2,
  Pencil,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Volume2,
  X,
  Zap,
} from 'lucide-react';
import { loadSavedAudio, saveAudio } from './audioStore.js';
import {
  fixtureSnapshotScope,
  readFixtureSnapshot,
  rememberFixtureScope,
  removeFixtureSnapshot,
  writeFixtureSnapshot,
} from './fixtureSnapshot.js';
import { groupedReminderHistory, latestReminderAt, translatedReminderMessage, unreadReminderCount } from './reminderHistory.js';

const STATUS_META = {
  scheduled: { label: '等待启动', tone: 'scheduled' },
  running: { label: '监控中', tone: 'running' },
  triggered: { label: '已触发', tone: 'triggered' },
  stopped: { label: '已停止', tone: 'stopped' },
  error: { label: '等待重试', tone: 'error' },
};

const OPERATOR_LABELS = { gt: '大于', gte: '大于等于', eq: '等于', lt: '小于', lte: '小于等于' };
const EVALUATE_WHEN_LABELS = { in_play: '比赛开始后持续判断', all_finished: '全部比赛结束后', each_finished: '每场比赛结束时', halftime: '比赛进入半场后' };
const METRIC_LABELS = { total_goals: '总进球数', goal_difference: '比分差', home_leading: '主队领先客队', home_trailing: '主队落后客队' };
const FINISHED = new Set(['FT', 'AET', 'PEN']);
const TERMINAL = new Set(['FT', 'AET', 'PEN', 'CANC', 'ABD', 'AWD', 'WO', 'PST', 'SUSP']);
const DEFAULT_AUDIO_URL = '/default-alert.mp3';
const DEFAULT_AUDIO_NAME = '刘欢 - 好汉歌';

function compactFixture(fixture) {
  return {
    provider: fixture.provider,
    fixture: {
      id: fixture.fixture?.id,
      date: fixture.fixture?.date,
      status: fixture.fixture?.status,
    },
    league: {
      id: fixture.league?.id,
      name: fixture.league?.name,
      country: fixture.league?.country,
      logo: fixture.league?.logo,
    },
    teams: {
      home: fixture.teams?.home,
      away: fixture.teams?.away,
    },
    goals: fixture.goals,
  };
}

function createMonitorRule(overrides = {}) {
  return {
    id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fixtureId: 'all',
    matchScope: 'any',
    evaluateWhen: 'in_play',
    metric: 'total_goals',
    operator: 'gt',
    threshold: 2,
    ...overrides,
  };
}

function teamDisplayName(team, translations = {}) {
  return translations[team?.name] || team?.zhName || team?.name || '未知球队';
}

function hasChineseTeamName(team, translations = {}) {
  return /[\u3400-\u9fff]/.test(teamDisplayName(team, translations));
}

function normalizedTaskRules(task) {
  if (Array.isArray(task.rules) && task.rules.length) return task.rules;
  return [{
    id: 'legacy',
    fixtureId: 'all',
    matchScope: task.matchScope || 'any',
    evaluateWhen: task.evaluateWhen || 'all_finished',
    metric: task.metric || 'total_goals',
    operator: task.operator || 'gt',
    threshold: task.threshold ?? 0,
  }];
}

function monitorRuleLabel(rule, fixtures, translations = {}) {
  const fixture = fixtures.find((item) => String(item.fixture.id) === String(rule.fixtureId));
  const target = fixture
    ? `${teamDisplayName(fixture.teams.home, translations)} vs ${teamDisplayName(fixture.teams.away, translations)}`
    : `所有已选比赛（${rule.matchScope === 'all' ? '全部同时满足' : '任意一场满足'}）`;
  const condition = ['home_leading', 'home_trailing'].includes(rule.metric)
    ? METRIC_LABELS[rule.metric]
    : `${METRIC_LABELS[rule.metric] || '总进球数'} ${OPERATOR_LABELS[rule.operator] || '大于'} ${rule.threshold}`;
  return `${target} · ${EVALUATE_WHEN_LABELS[rule.evaluateWhen] || '比赛开始后持续判断'} · ${condition}`;
}

function homeTrailingRuleComplete(rule, fixtures) {
  if (rule.metric !== 'home_trailing') return false;
  const targets = rule.fixtureId && rule.fixtureId !== 'all'
    ? fixtures.filter((fixture) => String(fixture.fixture.id) === String(rule.fixtureId))
    : fixtures;
  return targets.length > 0 && targets.every((fixture) => TERMINAL.has(fixture.fixture.status.short));
}

function localDateValue(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function shiftedDateValue(days) {
  return localDateValue(new Date(Date.now() + days * 24 * 60 * 60_000));
}

function localDateTimeValue(date = new Date(Date.now() + 5 * 60_000)) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function defaultStartAt(monitorDate, fixtures = []) {
  const kickoff = fixtures
    .map((fixture) => Date.parse(fixture.fixture?.date))
    .filter(Number.isFinite)
    .sort((left, right) => left - right)[0];
  if (kickoff) return localDateTimeValue(new Date(kickoff));
  if (monitorDate === localDateValue()) return localDateTimeValue();
  return `${monitorDate}T18:00`;
}

function monitorDateLabel(value) {
  if (value === localDateValue()) return '今天';
  if (value === shiftedDateValue(1)) return '明天';
  if (value === shiftedDateValue(2)) return '后天';
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(`${value}T12:00:00`));
}

function reminderDateLabel(value) {
  if (value === localDateValue()) return `今天 · ${value}`;
  if (value === shiftedDateValue(-1)) return `昨天 · ${value}`;
  return value === 'unknown' ? '时间未知' : value;
}

function formatDateTime(value, withDate = true) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    ...(withDate ? { month: '2-digit', day: '2-digit' } : {}),
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value));
}

function fixtureStatus(fixture) {
  const code = fixture.fixture.status.short;
  if (FINISHED.has(code)) return '完场';
  if (code === 'NS') return formatDateTime(fixture.fixture.date, false);
  if (code === 'HT') return '中场';
  if (['1H', '2H', 'ET'].includes(code)) return `${fixture.fixture.status.elapsed ?? ''}′`;
  return fixture.fixture.status.long || code;
}

function TeamMark({ name, logo }) {
  if (logo) return <img className="team-mark" src={logo} alt="" loading="lazy" />;
  return <span className="team-mark team-mark--fallback">{name.slice(0, 1)}</span>;
}

function StatusPill({ status }) {
  const meta = STATUS_META[status] || STATUS_META.stopped;
  return <span className={`status-pill status-pill--${meta.tone}`}><i />{meta.label}</span>;
}

function EmptyState({ onCreate }) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon"><Radio size={24} /></div>
      <h2>还没有监控任务</h2>
      <p>先从上方选择比赛，再设置提醒条件。</p>
      <button className="button button--primary" onClick={onCreate}><Plus size={17} />创建监控任务</button>
    </div>
  );
}

function MatchCard({ fixture, selected, onToggle, onTranslate, compact = false, translations = {} }) {
  const live = ['1H', '2H', 'HT', 'ET'].includes(fixture.fixture.status.short);
  const finished = FINISHED.has(fixture.fixture.status.short);
  const homeOriginal = fixture.teams.home.name;
  const awayOriginal = fixture.teams.away.name;
  const homeName = translations[homeOriginal] || fixture.teams.home.zhName || homeOriginal;
  const awayName = translations[awayOriginal] || fixture.teams.away.zhName || awayOriginal;
  return (
    <div className="match-card-wrap">
      <button
        type="button"
        className={`match-card ${selected ? 'match-card--selected' : ''} ${compact ? 'match-card--compact' : ''}`}
        onClick={() => onToggle?.(fixture)}
        aria-pressed={selected}
      >
      <div className="match-card__topline">
        <span>{fixture.league.name}</span>
        <span className={live ? 'live-copy' : ''}>{live && <i />}{fixtureStatus(fixture)}</span>
      </div>
      <div className="match-card__scoreboard">
        <div className="match-card__team">
          <TeamMark name={homeName} logo={fixture.teams.home.logo} />
          <span title={homeName === homeOriginal ? undefined : homeOriginal}>{homeName}</span>
        </div>
        <div className="match-card__score">
          <strong>{fixture.goals.home ?? '–'}</strong>
          <span>:</span>
          <strong>{fixture.goals.away ?? '–'}</strong>
        </div>
        <div className="match-card__team match-card__team--away">
          <TeamMark name={awayName} logo={fixture.teams.away.logo} />
          <span title={awayName === awayOriginal ? undefined : awayOriginal}>{awayName}</span>
        </div>
      </div>
      {!compact && (
        <div className="match-card__footer">
          <span>{formatDateTime(fixture.fixture.date)}</span>
          <span className="match-card__selection">{selected ? <><Check size={14} />已选择</> : '点击选择'}</span>
        </div>
      )}

      </button>
      {onTranslate && <div className="match-card__translate-actions"><button type="button" onClick={() => onTranslate(homeOriginal, homeName)} title={`修正 ${homeOriginal} 的中文名`}><Pencil size={11} />主队译名</button><button type="button" onClick={() => onTranslate(awayOriginal, awayName)} title={`修正 ${awayOriginal} 的中文名`}><Pencil size={11} />客队译名</button></div>}
    </div>
  );
}

function ApiUsageHistory({ item }) {
  if (!item) return null;
  const history = (item.usageHistory || []).slice(0, 7);
  const remaining = item.latestQuota?.remaining;
  const lowRemaining = remaining != null && Number(remaining) < 25;
  return (
    <section className={`api-usage-history api-usage-history--${item.usageLevel || 'normal'}`}>
      <div><strong>{item.label} · 最近每日用量</strong><small>{item.usagePercent != null ? `平台额度已用 ${item.usagePercent}%` : '按北京时间统计真实上游请求'}</small></div>
      {remaining != null && <div className={`api-usage-remaining ${lowRemaining ? 'api-usage-remaining--low' : ''}`}><span>今日剩余额度</span><strong>{remaining}</strong>{item.latestQuota?.limit != null && <em>/ {item.latestQuota.limit}</em>}<small>{lowRemaining ? '不足 25 次，任务频次已强制调整为 10 分钟' : '额度充足'}</small></div>}
      {history.length ? <table><thead><tr><th>日期</th><th>总请求</th><th>比赛</th><th>测试</th></tr></thead><tbody>{history.map((usage) => <tr key={usage.date}><td>{usage.date}</td><td>{usage.total}</td><td>{usage.fixtures}</td><td>{usage.tests}</td></tr>)}</tbody></table> : <p>这个 Key 暂无请求记录。</p>}
    </section>
  );
}

function TaskListItem({ task, active, unreadCount = 0, onClick }) {
  return (
    <button className={`task-item ${active ? 'task-item--active' : ''} ${unreadCount ? 'task-item--unread' : ''}`} onClick={onClick}>
      <span className="task-item__icon">{unreadCount ? <BellRing size={16} /> : <Radio size={16} />}{unreadCount > 0 && <i>{unreadCount > 99 ? '99+' : unreadCount}</i>}</span>
      <span className="task-item__copy">
        <strong>{task.name}</strong>
        <small>{task.fixtures.length} 场 · {task.intervalMinutes} 分钟{task.quotaFrequencyAdjustedAt ? '（额度保护已调整）' : ''}</small>
      </span>
      <StatusPill status={task.status} />
    </button>
  );
}

function ReminderHistoryPanel({ groups, unreadCount, tasks, translations, onSelectTask }) {
  const total = groups.reduce((count, group) => count + group.reminders.length, 0);
  return (
    <aside className="reminder-history-panel" aria-label="全部提醒历史">
      <div className="reminder-history-panel__header">
        <div><span><BellRing size={17} /></span><div><p className="section-caption">提醒历史</p><h2>全部提醒</h2></div></div>
        <em className={unreadCount ? 'has-unread' : ''}>{unreadCount ? `${unreadCount} 条未读` : `${total} 条`}</em>
      </div>
      {groups.length ? <div className="reminder-day-list">{groups.map((group) => (
        <section className="reminder-day" key={group.day}>
          <div className="reminder-day__heading"><strong>{reminderDateLabel(group.day)}</strong><span>{group.reminders.length} 条</span></div>
          <div className="reminder-day__events">{group.reminders.map((event) => (
            <button type="button" className={`reminder-event ${event.unread ? 'reminder-event--unread' : ''}`} key={event.reminderId} onClick={() => onSelectTask(event.taskId)}>
              <span className="reminder-event__icon"><BellRing size={13} /></span>
              <span className="reminder-event__copy"><strong>{event.taskName}</strong><small>{formatDateTime(event.triggeredAt, false)}</small><p>{translatedReminderMessage(event.message, tasks.find((task) => task.id === event.taskId)?.fixtures, translations)}</p></span>
              <ChevronRight size={14} />
            </button>
          ))}</div>
        </section>
      ))}</div> : <div className="reminder-history-panel__empty"><BellRing size={22} /><strong>暂无提醒记录</strong><span>监控指标触发后会按天汇总在这里。</span></div>}
    </aside>
  );
}

function CreateTaskPanel({ fixtures, selectedIds, setSelectedIds, monitorDate, translations, apiKeys = [], task = null, onClose, onCreated, onError, onArmSound }) {
  const [submitting, setSubmitting] = useState(false);
  const fallbackApiKeyId = apiKeys.find((item) => item.active)?.id || apiKeys[0]?.id || '';
  const availableFixtures = [...fixtures, ...(task?.fixtures || [])].filter((fixture, index, items) => items.findIndex((item) => String(item.fixture.id) === String(fixture.fixture.id)) === index);
  const selectedFixtures = availableFixtures.filter((item) => selectedIds.some((id) => String(id) === String(item.fixture.id)));
  const [form, setForm] = useState(() => task ? {
    name: task.name,
    startMode: task.status === 'scheduled' ? 'scheduled' : 'now',
    startAt: localDateTimeValue(new Date(task.startAt)),
    intervalMinutes: task.intervalMinutes,
    apiKeyId: apiKeys.some((item) => item.id === task.apiKeyId) ? task.apiKeyId : fallbackApiKeyId,
    rules: normalizedTaskRules(task).map((rule) => ({ ...rule })),
    resetHistory: false,
  } : {
    name: '今晚比分提醒',
    startMode: 'scheduled',
    startAt: defaultStartAt(monitorDate, selectedFixtures),
    intervalMinutes: 5,
    apiKeyId: fallbackApiKeyId,
    rules: [createMonitorRule()],
    resetHistory: false,
  });

  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const updateRule = (id, key, value) => setForm((current) => ({
    ...current,
    rules: current.rules.map((rule) => rule.id === id ? {
      ...rule,
      [key]: value,
      ...(key === 'metric' && value === 'home_leading' ? { evaluateWhen: 'halftime', operator: 'gt', threshold: 0 } : {}),
      ...(key === 'metric' && value === 'home_trailing' ? { evaluateWhen: 'halftime', operator: 'lt', threshold: 0 } : {}),
    } : rule),
  }));
  const addRule = () => setForm((current) => ({ ...current, rules: [...current.rules, createMonitorRule()] }));
  const removeRule = (id) => setForm((current) => ({ ...current, rules: current.rules.filter((rule) => rule.id !== id) }));
  const toggleFixture = (fixture) => {
    const removing = selectedIds.some((id) => String(id) === String(fixture.fixture.id));
    setSelectedIds((current) => removing
      ? current.filter((id) => String(id) !== String(fixture.fixture.id))
      : [...current, fixture.fixture.id]);
    if (removing) setForm((current) => ({
      ...current,
      rules: current.rules.map((rule) => String(rule.fixtureId) === String(fixture.fixture.id) ? { ...rule, fixtureId: 'all' } : rule),
    }));
  };

  async function submit(event) {
    event.preventDefault();
    onArmSound();
    setSubmitting(true);
    try {
      const response = await fetch(task ? `/api/tasks/${encodeURIComponent(task.id)}` : '/api/tasks', {
        method: task ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          monitorDate: task?.monitorDate || monitorDate,
          startAt: form.startMode === 'now' ? new Date().toISOString() : new Date(form.startAt).toISOString(),
          fixtures: selectedFixtures,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || (task ? '更新任务失败' : '创建任务失败'));
      onCreated(body.task);
    } catch (error) {
      onError(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="task-drawer" role="dialog" aria-modal="true" aria-labelledby="create-task-title">
        <div className="task-drawer__header">
          <div><p className="section-caption">{task ? '编辑任务' : '新建任务'}</p><h2 id="create-task-title">{task ? '更新监控设置' : '设置监控条件'}</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="关闭"><X size={20} /></button>
        </div>
        <form onSubmit={submit}>
          <section className="form-section">
            <div className="form-section__title"><span>01</span><div><strong>选择目标</strong><small>已选择 {selectedFixtures.length} 场比赛</small></div></div>
            <div className="monitor-date-summary"><CalendarDays size={17} /><span>监控日期</span><strong>{monitorDateLabel(task?.monitorDate || monitorDate)} · {task?.monitorDate || monitorDate}</strong></div>
            <label className="field"><span>任务名称</span><input value={form.name} onChange={(event) => update('name', event.target.value)} /></label>
            {apiKeys.length > 0 && <label className="field"><span>固定使用的 API Key</span><select value={form.apiKeyId} onChange={(event) => update('apiKeyId', event.target.value)}>{apiKeys.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.hint} · {item.provider}</option>)}</select></label>}
            <div className="drawer-fixtures">
              {availableFixtures.map((fixture) => <MatchCard key={fixture.fixture.id} fixture={fixture} compact translations={translations} selected={selectedIds.some((id) => String(id) === String(fixture.fixture.id))} onToggle={toggleFixture} />)}
            </div>
          </section>

          <section className="form-section">
            <div className="form-section__title"><span>02</span><div><strong>启动时间</strong><small>默认使用所选比赛最早开球时间</small></div></div>
            <div className="segmented">
              <button type="button" className={form.startMode === 'now' ? 'is-active' : ''} onClick={() => update('startMode', 'now')}>立即开始</button>
              <button type="button" className={form.startMode === 'scheduled' ? 'is-active' : ''} onClick={() => update('startMode', 'scheduled')}>定时开始</button>
            </div>
            {form.startMode === 'scheduled' && <label className="field"><span>开始时间 · Asia/Shanghai</span><input type="datetime-local" value={form.startAt} onChange={(event) => update('startAt', event.target.value)} /></label>}
            <label className="field"><span>共享监控频次</span><div className="input-unit"><input type="number" min="5" max="1440" value={form.intervalMinutes} onChange={(event) => update('intervalMinutes', event.target.value)} /><em>分钟 / 次</em></div></label>
            <div className="quick-values">{[5, 10, 15, 30].map((value) => <button type="button" key={value} className={Number(form.intervalMinutes) === value ? 'is-active' : ''} onClick={() => update('intervalMinutes', value)}>{value} 分钟</button>)}</div>
            <p className="rule-list-note">同一 API Key、平台和比赛日期的任务共享比分刷新；默认 5 分钟，同一轮只消耗一次上游请求。</p>
          </section>

          <section className="form-section">
            <div className="form-section__title"><span>03</span><div><strong>监控指标</strong><small>每个指标命中一次后，任务继续监控其他指标</small></div></div>
            <div className="rule-list">
              {form.rules.map((rule, index) => (
                <div className="rule-card" key={rule.id}>
                  <div className="rule-card__header">
                    <strong>指标 {index + 1}</strong>
                    {form.rules.length > 1 && <button type="button" onClick={() => removeRule(rule.id)}><Trash2 size={14} />删除</button>}
                  </div>
                  <div className="field-grid">
                    <label className="field"><span>适用比赛</span><select value={rule.fixtureId} onChange={(event) => updateRule(rule.id, 'fixtureId', event.target.value)}><option value="all">所有已选比赛</option>{selectedFixtures.map((fixture) => <option key={fixture.fixture.id} value={fixture.fixture.id}>{teamDisplayName(fixture.teams.home, translations)} vs {teamDisplayName(fixture.teams.away, translations)}</option>)}</select></label>
                    <label className="field"><span>判断时机</span><select value={rule.evaluateWhen} onChange={(event) => updateRule(rule.id, 'evaluateWhen', event.target.value)}><option value="in_play">比赛开始后持续判断</option><option value="halftime">比赛进入半场后</option><option value="each_finished">每场比赛结束时</option><option value="all_finished">全部比赛结束后</option></select></label>
                    {rule.fixtureId === 'all' && <label className="field"><span>多场范围</span><select value={rule.matchScope || 'any'} onChange={(event) => updateRule(rule.id, 'matchScope', event.target.value)}><option value="any">任意一场满足</option><option value="all">全部比赛同时满足</option></select></label>}
                    <label className="field"><span>监控指标</span><select value={rule.metric} onChange={(event) => updateRule(rule.id, 'metric', event.target.value)}><option value="home_leading">主队领先客队</option><option value="home_trailing">主队落后客队</option><option value="total_goals">总进球数</option><option value="goal_difference">比分差</option></select></label>
                    {!['home_leading', 'home_trailing'].includes(rule.metric) && <label className="field"><span>比较条件</span><div className="condition-fields"><select value={rule.operator} onChange={(event) => updateRule(rule.id, 'operator', event.target.value)}>{Object.entries(OPERATOR_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><input type="number" min="0" value={rule.threshold} onChange={(event) => updateRule(rule.id, 'threshold', event.target.value)} /></div></label>}
                  </div>
                  <div className="rule-summary"><Sparkles size={18} /><p>{monitorRuleLabel(rule, selectedFixtures, translations)}</p></div>
                </div>
              ))}
            </div>
            <button type="button" className="add-rule-button" onClick={addRule} disabled={form.rules.length >= 20}><Plus size={15} />添加监控指标</button>
            <p className="rule-list-note">同一指标对同一场比赛只提醒一次，后续轮询会继续判断尚未命中的指标。</p>
          </section>

          {task && <label className="reset-history-option"><input type="checkbox" checked={form.resetHistory} onChange={(event) => update('resetHistory', event.target.checked)} /><span><strong>清空既有提醒记录</strong><small>不勾选时保留已触发指标和历史，避免编辑后重复提醒。</small></span></label>}

          <div className="task-drawer__actions">
            <button type="button" className="button button--ghost" onClick={onClose}>取消</button>
            <button className="button button--primary" disabled={submitting || !selectedFixtures.length || (apiKeys.length > 0 && !form.apiKeyId)}>{submitting ? <LoaderCircle className="spin" size={17} /> : <Radio size={17} />}{task ? '保存并重新监控' : '启动监控'}</button>
          </div>
        </form>
      </aside>
    </div>
  );
}

function TaskDetail({ task, translations, apiKeys = [], onAction, onEdit }) {
  if (!task) return null;
  const meta = STATUS_META[task.status] || STATUS_META.stopped;
  const rules = normalizedTaskRules(task);
  const boundKey = apiKeys.find((item) => item.id === task.apiKeyId);
  return (
    <section className="task-detail" id="task-detail">
      <div className="task-detail__header">
        <div><div className="task-detail__kicker"><StatusPill status={task.status} /><span>ID {task.id.slice(0, 8)}</span></div><h2>{task.name}</h2><p>{task.error ? '本轮比分更新失败，提醒条件尚未重新判断' : task.lastMessage}</p></div>
        <div className="task-detail__actions">
          <button className="button button--secondary" onClick={() => onEdit(task)}><Pencil size={16} />编辑</button>
          {['stopped', 'triggered', 'error'].includes(task.status) && task.errorCode !== 'API_KEY_REMOVED' && <button className="button button--secondary" onClick={() => onAction(task.id, 'run')}><Play size={16} />{task.status === 'error' ? '立即重试' : '再次启动'}</button>}
          {['scheduled', 'running', 'error'].includes(task.status) && <button className="button button--secondary" onClick={() => onAction(task.id, 'stop')}><CircleStop size={16} />停止</button>}
          <button className="icon-button icon-button--danger" onClick={() => onAction(task.id, 'delete')} aria-label="删除任务"><Trash2 size={18} /></button>
        </div>
      </div>

      <div className="metric-strip">
        <div><Clock3 size={18} /><span>开始时间<strong>{formatDateTime(task.startAt)}</strong></span></div>
        <div><RefreshCw size={18} /><span>监控频次<strong>{task.intervalMinutes} 分钟{task.quotaFrequencyAdjustedAt ? ' · 额度保护已调整' : ''}</strong></span></div>
        <div><AlarmClock size={18} /><span>{task.status === 'scheduled' ? '计划启动' : '下次检查'}<strong>{formatDateTime(task.status === 'scheduled' ? task.startAt : task.nextCheckAt)}</strong></span></div>
      </div>

      <div className={`monitor-beam monitor-beam--${meta.tone}`}>
        <div className="monitor-beam__copy"><span>提醒规则</span><strong>{task.status === 'running' ? '正在监控' : meta.label}</strong></div>
        <div className="monitor-beam__rule">{rules.length} 个监控指标 · 已触发 {task.triggerCount || 0} 次 · 比赛结束后自动停止</div>
      </div>

      <div className={`task-key-binding ${boundKey ? '' : 'task-key-binding--missing'}`}><KeyRound size={16} /><span>固定 API Key</span><strong>{boundKey ? `${boundKey.label} · ${boundKey.hint}` : task.apiKeyId ? '绑定的 Key 已不存在，请编辑任务' : '旧任务将在下次检查时自动固定当前 Key'}</strong></div>

      <div className="task-rule-list">
        {rules.map((rule, index) => {
          const firedCount = (task.triggeredRuleKeys || []).filter((key) => key.startsWith(`${rule.id}:`)).length;
          const completed = homeTrailingRuleComplete(rule, task.fixtures);
          const status = completed ? `${firedCount ? `已提醒 ${firedCount} 次 · ` : ''}已结束` : firedCount ? `已提醒 ${firedCount} 次` : task.status === 'stopped' ? '已停止' : '监控中';
          return <div className={`task-rule-item ${firedCount ? 'task-rule-item--fired' : ''}`} key={rule.id || index}><span>{firedCount ? <Check size={13} /> : index + 1}</span><p>{monitorRuleLabel(rule, task.fixtures, translations)}</p><em>{status}</em></div>;
        })}
      </div>

      <p className={`data-freshness ${task.error ? 'data-freshness--stale' : ''}`}>
        {task.error ? '当前展示历史比分 · ' : '比分更新时间 · '}{task.lastSucceededAt ? formatDateTime(task.lastSucceededAt) : '暂无成功更新记录'}
      </p>
      <div className="task-fixtures">
        {task.fixtures.map((fixture) => <MatchCard key={fixture.fixture.id} fixture={fixture} compact translations={translations} selected={fixture.fixture.id === task.triggerFixtureId} />)}
      </div>
      {task.error && <div className="error-banner" role="alert"><Zap size={18} /><div><strong>比分更新失败{task.errorCode ? ` · ${task.errorCode}` : ''}</strong><p>{task.error === 'fetch failed' ? '无法连接比分服务，请检查服务器网络或代理设置。' : task.error}</p><p>{task.status === 'error' ? `连续失败 ${task.consecutiveFailures || 1} 次 · 将于 ${formatDateTime(task.nextCheckAt)} 自动重试，也可点击“立即重试”。` : '任务已停止，可再次启动检查连接。'}</p></div></div>}
    </section>
  );
}

export default function App() {
  const [activePage, setActivePage] = useState(() => window.location.hash === '#monitor' ? 'monitor' : 'fixtures');
  const [initialFixtureSnapshot] = useState(readFixtureSnapshot);
  const [health, setHealth] = useState({ apiConfigured: false, mode: 'demo' });
  const [tasks, setTasks] = useState([]);
  const [fixtures, setFixtures] = useState(initialFixtureSnapshot?.fixtures || []);
  const [fixtureMeta, setFixtureMeta] = useState(initialFixtureSnapshot?.meta || { cache: null, quota: null });
  const [hasQueriedFixtures, setHasQueriedFixtures] = useState(Boolean(initialFixtureSnapshot?.queried));
  const [activeTaskId, setActiveTaskId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [date, setDate] = useState(initialFixtureSnapshot?.date || localDateValue());
  const [fixtureSearch, setFixtureSearch] = useState('');
  const [untranslatedOnly, setUntranslatedOnly] = useState(false);
  const [visibleCount, setVisibleCount] = useState(24);
  const [loadingFixtures, setLoadingFixtures] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundReady, setSoundReady] = useState(false);
  const [audioUrl, setAudioUrl] = useState('');
  const [audioName, setAudioName] = useState(DEFAULT_AUDIO_NAME);
  const [customAudioSelected, setCustomAudioSelected] = useState(false);
  const [alertTask, setAlertTask] = useState(null);
  const [toast, setToast] = useState('');
  const [teamTranslations, setTeamTranslations] = useState({});
  const [apiKeyOpen, setApiKeyOpen] = useState(false);
  const [apiKeyValue, setApiKeyValue] = useState('');
  const [apiKeyLabel, setApiKeyLabel] = useState('');
  const [apiProviderId, setApiProviderId] = useState('api-football');
  const [apiKeys, setApiKeys] = useState([]);
  const [loadingApiKeys, setLoadingApiKeys] = useState(false);
  const [savingApiKey, setSavingApiKey] = useState(false);
  const [editingApiKeyId, setEditingApiKeyId] = useState(null);
  const [deletingApiKeyId, setDeletingApiKeyId] = useState(null);
  const [switchingApiKeyId, setSwitchingApiKeyId] = useState(null);
  const [testingApiKeyId, setTestingApiKeyId] = useState(null);
  const [translationEditor, setTranslationEditor] = useState(null);
  const [savingTranslation, setSavingTranslation] = useState(false);
  const audioRef = useRef(null);
  const audioContextRef = useRef(null);
  const soundArmPromiseRef = useRef(null);
  const customAudioUrlRef = useRef('');
  const translationRequestsRef = useRef(new Set());
  const fixtureRestoreRequestRef = useRef(0);
  const usageWarningLevelsRef = useRef({});

  const activeTask = useMemo(() => tasks.find((task) => task.id === activeTaskId) || tasks[0] || null, [tasks, activeTaskId]);
  const reminderGroups = useMemo(() => groupedReminderHistory(tasks), [tasks]);
  const totalUnreadReminders = useMemo(() => tasks.reduce((count, task) => count + unreadReminderCount(task), 0), [tasks]);
  const activeApiKeyProfile = apiKeys.find((item) => item.active) || null;
  const activeFixtureScope = fixtureSnapshotScope(health.activeApiKeyId, health.providerId);
  const runningCount = tasks.filter((task) => ['running', 'scheduled'].includes(task.status)).length;
  const visibleFixtures = useMemo(() => {
    const keyword = fixtureSearch.trim().toLocaleLowerCase();
    return fixtures
      .filter((fixture) => !untranslatedOnly || !hasChineseTeamName(fixture.teams.home, teamTranslations) || !hasChineseTeamName(fixture.teams.away, teamTranslations))
      .filter((fixture) => !keyword || [
        fixture.league.name,
        fixture.league.country,
        fixture.teams.home.name,
        fixture.teams.away.name,
        teamTranslations[fixture.teams.home.name],
        teamTranslations[fixture.teams.away.name],
      ]
        .some((value) => value?.toLocaleLowerCase().includes(keyword)))
      .sort((left, right) => Date.parse(left.fixture.date) - Date.parse(right.fixture.date));
  }, [fixtures, fixtureSearch, untranslatedOnly, teamTranslations]);
  const displayedFixtures = useMemo(() => visibleFixtures.slice(0, visibleCount), [visibleFixtures, visibleCount]);
  const translationCoverage = useMemo(() => {
    const teams = new Map();
    fixtures.forEach((fixture) => [fixture.teams.home, fixture.teams.away].forEach((team) => teams.set(team.name, team)));
    const translated = [...teams.values()].filter((team) => hasChineseTeamName(team, teamTranslations)).length;
    return { translated, total: teams.size };
  }, [fixtures, teamTranslations]);

  function showToast(message) {
    setToast(message);
    window.setTimeout(() => setToast(''), 3200);
  }

  function navigatePage(page) {
    setActivePage(page);
    window.history.replaceState(null, '', page === 'monitor' ? '#monitor' : '#fixtures');
  }

  function beginCreateTask() {
    if (!selectedIds.length) {
      navigatePage('fixtures');
      showToast('请先在比赛查询页选择至少一场比赛');
      return;
    }
    setEditingTask(null);
    setDrawerOpen(true);
  }

  function beginEditTask(task) {
    setEditingTask(task);
    setSelectedIds(task.fixtures.map((fixture) => fixture.fixture.id));
    setDrawerOpen(true);
  }

  async function restoreCachedFixtures(value, { keepExisting = false, scope = activeFixtureScope } = {}) {
    const requestId = ++fixtureRestoreRequestRef.current;
    try {
      const response = await fetch(`/api/fixtures/cached?date=${value}&timezone=Asia/Shanghai`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || '缓存读取失败');
      if (requestId !== fixtureRestoreRequestRef.current) return;
      if (!body.cached) {
        if (!keepExisting) {
          setFixtures([]);
          setFixtureMeta({ cache: null, quota: null });
          setHasQueriedFixtures(false);
        }
        return;
      }
      const meta = { cache: body.cache || null, quota: body.quota || null };
      setFixtures(body.fixtures || []);
      setFixtureMeta(meta);
      setHasQueriedFixtures(true);
      writeFixtureSnapshot(scope, value, (body.fixtures || []).map(compactFixture), meta);
      return true;
    } catch {
      if (!keepExisting && requestId === fixtureRestoreRequestRef.current) {
        setFixtures([]);
        setFixtureMeta({ cache: null, quota: null });
        setHasQueriedFixtures(false);
      }
    }
    return false;
  }

  async function loadFixtures() {
    ++fixtureRestoreRequestRef.current;
    setLoadingFixtures(true);
    try {
      const response = await fetch(`/api/fixtures?date=${date}&timezone=Asia/Shanghai`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || '赛程加载失败');
      setFixtures(body.fixtures);
      const meta = { cache: body.cache || null, quota: body.quota || null };
      setFixtureMeta(meta);
      setHasQueriedFixtures(true);
      writeFixtureSnapshot(activeFixtureScope, date, body.fixtures.map(compactFixture), meta);
      if (body.cache?.quotaProtected) showToast('每日额度已进入保留区，赛事列表暂用缓存；监控任务仍可查询');
      else if (body.cache?.stale) showToast('比分服务暂时不可用，当前显示最近一次缓存');
    } catch (error) {
      showToast(error.message);
    } finally {
      setLoadingFixtures(false);
    }
  }

  function chooseDate(value) {
    setDate(value);
    setFixtures([]);
    setSelectedIds([]);
    setFixtureMeta({ cache: null, quota: null });
    setHasQueriedFixtures(false);
    restoreCachedFixtures(value);
  }

  async function acceptApiKeyState(body) {
    const scope = fixtureSnapshotScope(body.activeApiKeyId, body.providerId);
    const snapshot = readFixtureSnapshot(scope);
    const hasSnapshot = snapshot?.date === date;
    setHealth(body);
    setApiKeys(body.apiKeys || []);
    setSelectedIds([]);
    rememberFixtureScope(scope);
    if (hasSnapshot) {
      setFixtures(snapshot.fixtures);
      setFixtureMeta(snapshot.meta || { cache: null, quota: null });
      setHasQueriedFixtures(Boolean(snapshot.queried));
    } else {
      setFixtures([]);
      setFixtureMeta({ cache: null, quota: null });
      setHasQueriedFixtures(false);
    }
    return Boolean(await restoreCachedFixtures(date, { keepExisting: hasSnapshot, scope }) || hasSnapshot);
  }

  async function openApiKeySettings() {
    setEditingApiKeyId(null);
    setApiKeyLabel('');
    setApiKeyValue('');
    setApiKeyOpen(true);
    setLoadingApiKeys(true);
    try {
      const response = await fetch('/api/settings/api-keys');
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'API Key 列表加载失败');
      setHealth(body);
      setApiKeys(body.apiKeys || []);
    } catch (error) {
      showToast(error.message);
    } finally {
      setLoadingApiKeys(false);
    }
  }

  async function importApiKey(event) {
    event.preventDefault();
    setSavingApiKey(true);
    try {
      const editing = Boolean(editingApiKeyId);
      const response = await fetch(editing ? `/api/settings/api-keys/${encodeURIComponent(editingApiKeyId)}` : '/api/settings/api-key', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(editing ? {} : { apiKey: apiKeyValue }), label: apiKeyLabel, provider: apiProviderId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || (editing ? 'API Key 设置更新失败' : 'API Key 导入失败'));
      await acceptApiKeyState(body);
      setEditingApiKeyId(null);
      setApiKeyValue('');
      setApiKeyLabel('');
      showToast(editing ? 'API Key 平台已更新，请重新测试连接' : `API Key ${body.apiKeyHint} 已保存，请点击“测试”验证`);
    } catch (error) {
      showToast(error.message);
    } finally {
      setSavingApiKey(false);
    }
  }

  function editApiKey(item) {
    setEditingApiKeyId(item.id);
    setApiProviderId(item.provider);
    setApiKeyLabel(item.label);
    setApiKeyValue('');
  }

  function cancelApiKeyEdit() {
    setEditingApiKeyId(null);
    setApiKeyLabel('');
    setApiKeyValue('');
  }

  async function deleteApiKey(item) {
    const detail = item.source === 'environment' ? '删除后将从页面永久隐藏，服务重启后也不会重新导入。' : '';
    if (!window.confirm(`确定删除“${item.label}”（${item.hint}）吗？${detail}`)) return;
    setDeletingApiKeyId(item.id);
    try {
      const wasActive = item.id === health.activeApiKeyId;
      const response = await fetch(`/api/settings/api-keys/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'API Key 删除失败');
      if (editingApiKeyId === item.id) cancelApiKeyEdit();
      removeFixtureSnapshot(fixtureSnapshotScope(item.id, item.provider));
      if (wasActive) await acceptApiKeyState(body);
      else {
        setHealth(body);
        setApiKeys(body.apiKeys || []);
      }
      showToast(body.apiConfigured ? 'API Key 已删除' : 'API Key 已删除，当前进入演示模式');
    } catch (error) {
      showToast(error.message);
    } finally {
      setDeletingApiKeyId(null);
    }
  }

  async function switchApiKey(id) {
    if (id === health.activeApiKeyId) return;
    setSwitchingApiKeyId(id);
    try {
      const response = await fetch(`/api/settings/api-keys/${encodeURIComponent(id)}/activate`, { method: 'POST' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'API Key 切换失败');
      const restored = await acceptApiKeyState(body);
      showToast(restored
        ? `已切换到 ${body.apiKeyHint}，已恢复该 Key 的比赛缓存`
        : `已切换到 ${body.apiKeyHint}，该 Key 暂无当前日期缓存`);
    } catch (error) {
      showToast(error.message);
    } finally {
      setSwitchingApiKeyId(null);
    }
  }

  async function testApiKey(id) {
    setTestingApiKeyId(id);
    try {
      const response = await fetch(`/api/settings/api-keys/${encodeURIComponent(id)}/test`, { method: 'POST' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'API Key 测试失败');
      setHealth(body);
      setApiKeys(body.apiKeys || []);
      showToast(body.test?.ok ? `测试成功${body.test.quota?.remaining != null ? `，今日剩余 ${body.test.quota.remaining}/${body.test.quota.limit}` : ''}` : body.test?.message || 'API Key 测试失败');
    } catch (error) {
      showToast(error.message);
    } finally {
      setTestingApiKeyId(null);
    }
  }

  function editTeamTranslation(name, currentValue) {
    setTranslationEditor({ name, translation: currentValue === name ? '' : currentValue });
  }

  async function saveTeamTranslation(event) {
    event.preventDefault();
    setSavingTranslation(true);
    try {
      const response = await fetch('/api/team-translations/manual', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(translationEditor),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || '队名译名保存失败');
      setTeamTranslations((current) => ({ ...current, [body.translation.source]: body.translation.translated }));
      setTranslationEditor(null);
      showToast('中文队名已保存，后续比赛会继续使用');
    } catch (error) {
      showToast(error.message);
    } finally {
      setSavingTranslation(false);
    }
  }

  async function loadTasks() {
    const response = await fetch('/api/tasks');
    const body = await response.json();
    setTasks(body.tasks || []);
  }

  function selectTask(taskId) {
    const selectedTask = tasks.find((task) => task.id === taskId);
    setActiveTaskId(taskId);
    navigatePage('monitor');
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      document.getElementById('task-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
    if (!selectedTask || !unreadReminderCount(selectedTask)) return;
    const acknowledgedAt = latestReminderAt(selectedTask);
    if (!acknowledgedAt) return;
    setTasks((current) => current.map((task) => task.id === taskId
      ? { ...task, lastAcknowledgedTriggerAt: new Date(acknowledgedAt).toISOString() }
      : task));
    fetch(`/api/tasks/${encodeURIComponent(taskId)}/acknowledge`, { method: 'POST' })
      .then((response) => { if (!response.ok) throw new Error('提醒状态更新失败'); })
      .catch(() => loadTasks());
  }

  function playBuiltInAlert() {
    const context = audioContextRef.current;
    if (!context) return;
    [0, 0.22, 0.44].forEach((delay, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = [660, 880, 1100][index];
      gain.gain.setValueAtTime(0.0001, context.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.28, context.currentTime + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + delay + 0.18);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(context.currentTime + delay);
      oscillator.stop(context.currentTime + delay + 0.2);
    });
  }

  async function playSelectedAudio(loop = false) {
    if (!audioRef.current || !audioUrl) {
      playBuiltInAlert();
      showToast('提醒歌曲仍在加载，已先播放提示音');
      return false;
    }
    audioRef.current.loop = loop;
    audioRef.current.currentTime = 0;
    audioRef.current.volume = 1;
    audioRef.current.muted = false;
    try {
      await audioRef.current.play();
      setSoundReady(true);
      return true;
    } catch {
      playBuiltInAlert();
      setSoundReady(false);
      showToast('歌曲播放失败，已改用提示音；请点击“播放提醒声音”重试');
      return false;
    }
  }

  function playAlert() {
    if (!soundEnabled) {
      showToast('提醒已触发，请点击“启用声音”后试听');
      return;
    }
    playSelectedAudio(true);
  }

  async function enableSound(preview = true, requestNotifications = true) {
    setSoundEnabled(true);
    if (requestNotifications && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    if (!soundArmPromiseRef.current) soundArmPromiseRef.current = (async () => {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!audioContextRef.current && AudioContext) audioContextRef.current = new AudioContext();
      const ready = audioContextRef.current
        ? audioContextRef.current.resume().then(() => audioContextRef.current.state === 'running').catch(() => false)
        : Promise.resolve(false);
      const unlocked = await ready;
      setSoundReady(unlocked);
      return unlocked;
    })();
    const pending = soundArmPromiseRef.current;
    const ready = await pending;
    if (soundArmPromiseRef.current === pending) soundArmPromiseRef.current = null;
    if (preview && ready) playBuiltInAlert();
    return ready;
  }

  async function handleAudioFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('audio/')) {
      showToast('请选择有效的音频文件');
      return;
    }
    const nextUrl = URL.createObjectURL(file);
    if (customAudioUrlRef.current) URL.revokeObjectURL(customAudioUrlRef.current);
    customAudioUrlRef.current = nextUrl;
    setAudioUrl(nextUrl);
    setAudioName(file.name);
    setCustomAudioSelected(true);
    await enableSound(false, false);
    try {
      await saveAudio(file);
      showToast('提醒歌曲已保存，下次会自动使用');
    } catch {
      showToast('歌曲可在本次使用，但浏览器未能持久保存');
    }
  }

  useEffect(() => {
    if (soundReady) return undefined;
    const armOnFirstInteraction = () => { enableSound(false, false); };
    window.addEventListener('pointerdown', armOnFirstInteraction, { capture: true });
    window.addEventListener('keydown', armOnFirstInteraction, { capture: true });
    return () => {
      window.removeEventListener('pointerdown', armOnFirstInteraction, { capture: true });
      window.removeEventListener('keydown', armOnFirstInteraction, { capture: true });
    };
  }, [soundReady, audioUrl]);

  useEffect(() => {
    Promise.all([
      fetch('/api/settings/api-keys').then((response) => response.json()),
      fetch('/api/tasks').then((response) => response.json()),
      fetch('/api/team-translations/known').then((response) => response.json()),
    ])
      .then(([healthBody, tasksBody, translationsBody]) => {
        acceptApiKeyState(healthBody);
        usageWarningLevelsRef.current = Object.fromEntries((healthBody.apiKeys || []).map((item) => [item.id, item.usageLevel]));
        setTasks(tasksBody.tasks || []);
        setTeamTranslations(translationsBody.translations || {});
      })
      .catch(() => showToast('无法连接监控服务'));
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function prepareAudio() {
      try {
        const saved = await loadSavedAudio();
        let blob = saved?.blob;
        if (!blob) {
          const response = await fetch(DEFAULT_AUDIO_URL);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          blob = await response.blob();
        }
        const localUrl = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(localUrl);
          return;
        }
        customAudioUrlRef.current = localUrl;
        setAudioUrl(localUrl);
        setAudioName(saved?.blob ? saved.name : DEFAULT_AUDIO_NAME);
        setCustomAudioSelected(Boolean(saved?.blob));
      } catch {
        if (!cancelled) showToast('默认提醒歌曲加载失败，将使用提示音');
      }
    }
    prepareAudio();
    return () => {
      cancelled = true;
      if (customAudioUrlRef.current) URL.revokeObjectURL(customAudioUrlRef.current);
    };
  }, []);

  useEffect(() => { setVisibleCount(24); }, [date, fixtureSearch, untranslatedOnly]);

  useEffect(() => {
    const candidates = [...displayedFixtures, ...(activeTask?.fixtures || [])]
      .flatMap((fixture) => [fixture.teams.home.name, fixture.teams.away.name]);
    const names = [...new Set(candidates)]
      .filter((name) => name && !teamTranslations[name] && !translationRequestsRef.current.has(name));
    if (!names.length) return;

    names.forEach((name) => translationRequestsRef.current.add(name));
    const batches = [];
    for (let index = 0; index < names.length; index += 80) batches.push(names.slice(index, index + 80));
    Promise.all(batches.map(async (batch) => {
      const response = await fetch('/api/team-translations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ names: batch }),
      });
      if (!response.ok) throw new Error('球队名称翻译失败');
      return response.json();
    })).then((results) => {
      setTeamTranslations((current) => ({
        ...current,
        ...Object.assign({}, ...results.map((result) => result.translations || {})),
      }));
    }).catch(() => {
      names.forEach((name) => translationRequestsRef.current.delete(name));
    });
  }, [displayedFixtures, activeTask, teamTranslations]);

  useEffect(() => {
    const events = new EventSource('/api/events');
    events.addEventListener('tasks-updated', (event) => setTasks(JSON.parse(event.data)));
    events.addEventListener('api-usage', (event) => {
      const body = JSON.parse(event.data);
      setHealth(body);
      setApiKeys(body.apiKeys || []);
      (body.apiKeys || []).forEach((item) => {
        const previous = usageWarningLevelsRef.current[item.id];
        usageWarningLevelsRef.current[item.id] = item.usageLevel;
        if (item.usageLevel === previous || !['warning', 'danger'].includes(item.usageLevel)) return;
        const message = `${item.label} 平台额度已使用 ${item.usagePercent}%${item.latestQuota?.remaining != null ? `，剩余 ${item.latestQuota.remaining}` : ''}`;
        showToast(message);
        if ('Notification' in window && Notification.permission === 'granted') new Notification('API 用量预警', { body: message });
      });
    });
    events.addEventListener('task-triggered', (event) => {
      const task = JSON.parse(event.data);
      setAlertTask(task);
      playAlert();
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('比分条件已达成', { body: `${task.name}：${task.lastMessage}` });
      }
    });
    return () => events.close();
  }, [soundEnabled, audioUrl]);

  function toggleFixture(fixture) {
    setSelectedIds((current) => current.includes(fixture.fixture.id)
      ? current.filter((id) => id !== fixture.fixture.id)
      : [...current, fixture.fixture.id]);
  }

  async function taskAction(id, action) {
    try {
      const response = await fetch(`/api/tasks/${id}${action === 'delete' ? '' : `/${action}`}`, { method: action === 'delete' ? 'DELETE' : 'POST' });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || '操作失败');
      }
      await loadTasks();
    } catch (error) {
      showToast(error.message);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" type="button" onClick={() => navigatePage('fixtures')} aria-label="比分提醒首页"><span className="brand__mark"><Activity size={19} /></span><span>比分提醒</span></button>
        <nav className="topbar__nav" aria-label="页面导航"><button className={activePage === 'fixtures' ? 'is-active' : ''} onClick={() => navigatePage('fixtures')}>查询比赛</button><button className={activePage === 'monitor' ? 'is-active' : ''} onClick={() => navigatePage('monitor')}>监控管理</button></nav>
        <div className="topbar__actions">
          <button className={`api-state ${health.activeApiKeyStatus === 'error' || activeApiKeyProfile?.usageLevel === 'danger' ? 'api-state--error' : activeApiKeyProfile?.usageLevel === 'warning' ? 'api-state--warning' : health.apiConfigured ? 'api-state--live' : ''}`} onClick={openApiKeySettings} title="管理、测试和切换比分 API">{health.activeApiKeyStatus === 'error' || ['warning', 'danger'].includes(activeApiKeyProfile?.usageLevel) ? <Zap size={16} /> : <KeyRound size={16} />}<span>{health.apiConfigured ? `${health.providerLabel || 'API'} ${health.apiKeyHint || '已配置'}${health.activeApiKeyStatus === 'error' ? ' · 异常' : activeApiKeyProfile?.usageLevel === 'danger' ? ' · 额度紧张' : activeApiKeyProfile?.usageLevel === 'warning' ? ' · 用量预警' : ''}${health.apiKeyCount > 1 ? ` · ${health.apiKeyCount} 个` : ''}` : '导入 API Key'}</span></button>
          <button className={`sound-control ${soundEnabled ? 'sound-control--on' : ''}`} onClick={() => enableSound(true)} title={soundReady ? '提醒声音已解锁' : '声音默认开启，首次点击页面后自动就绪'}><Volume2 size={17} />{soundReady ? '声音已就绪' : '声音已开启'}</button>
          <button className="button button--primary button--small" onClick={beginCreateTask}><Plus size={17} />新建监控</button>
        </div>
      </header>

      {activePage === 'monitor' && <aside className="sidebar" id="tasks">
        <div className="sidebar__label"><span>监控任务</span><strong>{tasks.length}</strong></div>
        <nav className="task-list" aria-label="监控任务列表">
          {tasks.map((task) => <TaskListItem key={task.id} task={task} active={activeTask?.id === task.id} unreadCount={unreadReminderCount(task)} onClick={() => selectTask(task.id)} />)}
          {!tasks.length && <p className="sidebar__empty">暂无任务<br />从右上角创建第一个监控</p>}
        </nav>
        <div className="sound-card">
          <span className="sound-card__icon"><Headphones size={19} /></span>
          <div><small>{customAudioSelected ? '上次选择' : '默认提醒歌曲'}</small><strong title={audioName}>{audioName}</strong></div>
          <button className="icon-button" aria-label="试听提醒歌曲" disabled={!audioUrl} onClick={() => { enableSound(false, false); playSelectedAudio(false); }}><Play size={16} /></button>
          <label className="icon-button" aria-label="上传提醒音乐"><Music2 size={17} /><input type="file" accept="audio/*" onChange={handleAudioFile} /></label>
          <audio ref={audioRef} src={audioUrl} preload="auto" />
        </div>
      </aside>}

      <main id="top" className={`workspace ${activePage === 'fixtures' ? 'workspace--full' : ''}`}>
        <section className="page-header">
          <div className="page-header__copy">
            <p className="section-caption">比赛比分提醒</p>
            <h1>{activePage === 'fixtures' ? '查询比赛' : '监控管理'}</h1>
            <p>{activePage === 'fixtures' ? '查询并选择比赛，已有查询结果会从缓存自动恢复。' : '查看任务状态、多个监控指标与实时提醒记录。'}</p>
          </div>
          <dl className="summary-list">
            <div><dt>进行中的任务</dt><dd>{runningCount}</dd></div>
            <div><dt>当前日期赛事</dt><dd>{fixtures.length}</dd></div>
            <div><dt>默认监控频次</dt><dd>5 <small>分钟</small></dd></div>
          </dl>
        </section>

        {!health.apiConfigured && <div className="demo-notice" role="status"><CloudCog size={18} /><div><strong>当前显示演示比赛</strong><span>尚未连接 API-Football，页面中的比赛不是真实赛程。</span></div></div>}

        {activePage === 'fixtures' && <section className="content-grid" id="fixtures">
          <div className="fixture-browser">
            <div className="section-heading">
              <div className="section-heading__copy"><span className="section-index">1</span><div><h2>选择{monitorDateLabel(date)}的比赛</h2><p>{date} · 共 {visibleFixtures.length} 场{translationCoverage.total ? ` · 中文队名 ${translationCoverage.translated}/${translationCoverage.total}` : ''}{fixtureMeta.quota?.remaining != null ? ` · 今日剩余 ${fixtureMeta.quota.remaining}/${fixtureMeta.quota.limit}` : ''}{fixtureMeta.cache ? ` · ${fixtureMeta.cache.source === 'api' ? '刚从 API 更新' : '已使用服务端缓存'}` : ''}</p></div></div>
              <div className="fixture-browser__tools">
                <div className="date-shortcuts">
                  {[0, 1, 2].map((days) => {
                    const value = shiftedDateValue(days);
                    return <button key={value} className={date === value ? 'is-active' : ''} onClick={() => chooseDate(value)}>{['今天', '明天', '后天'][days]}</button>;
                  })}
                </div>
                <label className="date-picker"><CalendarDays size={16} /><input type="date" min={localDateValue()} value={date} onChange={(event) => chooseDate(event.target.value)} /></label>
                <button className="button button--secondary button--small" onClick={loadFixtures} disabled={loadingFixtures} title="仅点击此按钮时查询；优先读取服务端缓存"><RefreshCw size={16} className={loadingFixtures ? 'spin' : ''} />查询比赛</button>
              </div>
            </div>
            <div className="filter-row">
              <button className={`filter-chip ${untranslatedOnly ? 'filter-chip--active' : ''}`} onClick={() => setUntranslatedOnly((value) => !value)}><Pencil size={13} />仅看未翻译</button>
              <label className="fixture-search"><Search size={14} /><input value={fixtureSearch} onChange={(event) => setFixtureSearch(event.target.value)} placeholder="搜索球队或联赛" aria-label="搜索球队或联赛" /></label>
              <span>{selectedIds.length} 场已选择</span>
            </div>
            {loadingFixtures ? <div className="loading-state"><LoaderCircle className="spin" /><span>正在查询比赛…</span></div> : visibleFixtures.length ? <><div className="fixture-grid">{displayedFixtures.map((fixture) => <MatchCard key={fixture.fixture.id} fixture={fixture} translations={teamTranslations} selected={selectedIds.includes(fixture.fixture.id)} onToggle={toggleFixture} onTranslate={editTeamTranslation} />)}</div>{visibleCount < visibleFixtures.length && <button className="load-more" onClick={() => setVisibleCount((count) => count + 24)}>显示更多比赛（剩余 {visibleFixtures.length - visibleCount} 场）</button>}</> : <div className="loading-state"><Search /><span>{hasQueriedFixtures ? '没有找到符合条件的比赛' : '选择日期后点击“查询比赛”，页面不会自动消耗 API 额度'}</span></div>}
            {selectedIds.length > 0 && <div className="selection-bar"><div><Check size={17} /><span>已锁定 <strong>{selectedIds.length}</strong> 场目标</span></div><button className="button button--primary button--small" onClick={() => { setEditingTask(null); setDrawerOpen(true); }}>配置规则<ChevronRight size={16} /></button></div>}
          </div>
        </section>}

        {activePage === 'monitor' && <div className="monitor-management-grid"><div className="monitor-management-grid__main">{apiKeys.length > 0 && <section className="api-usage-dashboard"><div className="api-usage-dashboard__heading"><div><p className="section-caption">统一 API 用量</p><h2>今日真实请求 {apiKeys.reduce((total, item) => total + Number(item.todayUsage?.total || 0), 0)} 次</h2></div><button className="button button--secondary button--small" onClick={openApiKeySettings}><KeyRound size={15} />管理 Key</button></div><div className="api-usage-dashboard__grid">{apiKeys.map((item) => <ApiUsageHistory key={item.id} item={item} />)}</div></section>}{activeTask ? <TaskDetail task={activeTask} translations={teamTranslations} apiKeys={apiKeys} onAction={taskAction} onEdit={beginEditTask} /> : <EmptyState onCreate={() => navigatePage('fixtures')} />}</div><ReminderHistoryPanel groups={reminderGroups} unreadCount={totalUnreadReminders} tasks={tasks} translations={teamTranslations} onSelectTask={selectTask} /></div>}
      </main>

      {drawerOpen && <CreateTaskPanel fixtures={fixtures} selectedIds={selectedIds} setSelectedIds={setSelectedIds} monitorDate={date} translations={teamTranslations} apiKeys={apiKeys} task={editingTask} onClose={() => { setDrawerOpen(false); setEditingTask(null); }} onError={showToast} onArmSound={() => enableSound(false)} onCreated={(task) => { const edited = Boolean(editingTask); setDrawerOpen(false); setEditingTask(null); setSelectedIds([]); setActiveTaskId(task.id); navigatePage('monitor'); loadTasks(); showToast(edited ? '监控任务已更新' : '监控任务已创建，声音提醒已启用'); }} />}

      {translationEditor && <div className="alert-overlay" onMouseDown={(event) => event.target === event.currentTarget && setTranslationEditor(null)}><form className="alert-dialog translation-dialog" onSubmit={saveTeamTranslation}><span className="alert-dialog__icon"><Pencil size={27} /></span><p className="section-caption">队名翻译</p><h2>修正中文队名</h2><p>保存后会写入服务器译名缓存，今后遇到同一支球队会直接使用。</p><label className="field"><span>API 返回的原名</span><input value={translationEditor.name} readOnly /></label><label className="field"><span>中文译名</span><input autoFocus maxLength="80" value={translationEditor.translation} onChange={(event) => setTranslationEditor((current) => ({ ...current, translation: event.target.value }))} placeholder="请输入包含中文的球队名称" /></label><div className="api-key-dialog__actions"><button type="button" className="button button--ghost" onClick={() => setTranslationEditor(null)}>取消</button><button className="button button--primary" disabled={savingTranslation || !/[\u3400-\u9fff]/.test(translationEditor.translation)}>{savingTranslation ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}保存译名</button></div></form></div>}

      {apiKeyOpen && <div className="alert-overlay" onMouseDown={(event) => event.target === event.currentTarget && setApiKeyOpen(false)}><form className="alert-dialog api-key-dialog" onSubmit={importApiKey}><span className="alert-dialog__icon"><KeyRound size={30} /></span><p className="section-caption">API 设置</p><h2>管理比分 API</h2><p>每个 Key 绑定一个平台；请求次数按北京时间每天独立统计并实时更新。</p>{loadingApiKeys ? <div className="api-key-list__loading"><LoaderCircle className="spin" size={18} />正在读取…</div> : apiKeys.length > 0 && <div className="api-key-list" role="list">{apiKeys.map((item) => <div role="listitem" key={item.id} className={`api-key-item ${item.active ? 'api-key-item--active' : ''} ${item.testStatus === 'error' ? 'api-key-item--error' : ''}`}><button type="button" className="api-key-item__select" onClick={() => switchApiKey(item.id)} disabled={Boolean(switchingApiKeyId || testingApiKeyId || deletingApiKeyId || savingApiKey)}><span><strong>{item.label}</strong><small>{health.providers?.find((provider) => provider.id === item.provider)?.label || item.provider} · {item.hint}{item.source === 'environment' ? ' · 环境变量' : ''}</small><small className="api-key-item__usage">今日请求 {item.todayUsage?.total || 0} 次 · 比赛 {item.todayUsage?.fixtures || 0} · 测试 {item.todayUsage?.tests || 0}</small><small className={`api-key-item__health api-key-item__health--${item.testStatus}`}>{item.testStatus === 'healthy' ? `连接正常${item.testQuota?.remaining != null ? ` · 剩余 ${item.testQuota.remaining}/${item.testQuota.limit}` : ''}` : item.testStatus === 'error' ? `连接异常 · ${item.testMessage}` : '尚未测试'}</small></span>{item.active ? <em><Check size={14} />使用中</em> : switchingApiKeyId === item.id ? <LoaderCircle className="spin" size={16} /> : <em>切换</em>}</button><button type="button" className="api-key-item__edit" onClick={() => editApiKey(item)} disabled={Boolean(testingApiKeyId || switchingApiKeyId || deletingApiKeyId || savingApiKey || item.source === 'environment')} title={item.source === 'environment' ? '环境变量 Key 请修改服务器配置' : '修改名称和绑定平台'}><Pencil size={13} />编辑</button><button type="button" className="api-key-item__test" onClick={() => testApiKey(item.id)} disabled={Boolean(testingApiKeyId || switchingApiKeyId || deletingApiKeyId || savingApiKey)}>{testingApiKeyId === item.id ? <LoaderCircle className="spin" size={14} /> : <Activity size={14} />}测试</button><button type="button" className="api-key-item__delete" onClick={() => deleteApiKey(item)} disabled={Boolean(testingApiKeyId || switchingApiKeyId || deletingApiKeyId || savingApiKey)} title={item.source === 'environment' ? '从页面停用并隐藏该环境变量 Key' : '删除 API Key'}>{deletingApiKeyId === item.id ? <LoaderCircle className="spin" size={14} /> : <Trash2 size={14} />}</button></div>)}</div>}<div className="api-key-form">{editingApiKeyId && <div className="api-key-editing">正在修改现有 Key；保存后将使用新平台重新测试，Key 内容保持不变。</div>}<label className="field"><span>{editingApiKeyId ? '绑定平台' : 'API 平台'}</span><select value={apiProviderId} onChange={(event) => setApiProviderId(event.target.value)}>{(health.providers || [{ id: 'api-football', label: 'API-Football' }, { id: 'the-stats-api', label: 'TheStatsAPI' }, { id: 'the-sports-db', label: 'TheSportsDB' }]).map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}</select></label><label className="field"><span>名称（可选）</span><input maxLength="40" value={apiKeyLabel} onChange={(event) => setApiKeyLabel(event.target.value)} placeholder="例如：比分备用账号" /></label>{!editingApiKeyId && <label className="field"><span>新增 API Key</span><input type="password" autoComplete="off" value={apiKeyValue} onChange={(event) => setApiKeyValue(event.target.value)} placeholder={apiProviderId === 'the-sports-db' ? '免费 Key 可填写 123' : '粘贴对应平台的 API Key'} /></label>}</div><div className="api-key-dialog__actions"><button type="button" className="button button--ghost" onClick={editingApiKeyId ? cancelApiKeyEdit : () => setApiKeyOpen(false)}>{editingApiKeyId ? '取消修改' : '完成'}</button><button className="button button--primary" disabled={savingApiKey || deletingApiKeyId || (!editingApiKeyId && !apiKeyValue.trim())}>{savingApiKey ? <LoaderCircle className="spin" size={17} /> : <KeyRound size={17} />}{editingApiKeyId ? '保存修改' : '保存并启用'}</button></div></form></div>}

      {alertTask && <div className="alert-overlay"><div className="alert-dialog"><span className="alert-dialog__icon"><BellRing size={32} /></span><p className="section-caption">监控提醒</p><h2>比分条件已达成</h2><p>{alertTask.lastMessage}</p><div className="alert-dialog__actions"><button className="button button--secondary" onClick={() => { enableSound(false, false); playSelectedAudio(true); }}><Volume2 size={16} />播放提醒声音</button><button className="button button--primary" onClick={() => { if (audioRef.current) { audioRef.current.loop = false; audioRef.current.pause(); audioRef.current.currentTime = 0; } setAlertTask(null); }}>收到，停止提醒</button></div></div></div>}
      {toast && <div className="toast"><Check size={16} />{toast}</div>}
    </div>
  );
}
