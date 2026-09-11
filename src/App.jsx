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
  ListFilter,
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

const STATUS_META = {
  scheduled: { label: '等待启动', tone: 'scheduled' },
  running: { label: '监控中', tone: 'running' },
  triggered: { label: '已触发', tone: 'triggered' },
  stopped: { label: '已停止', tone: 'stopped' },
  error: { label: '等待重试', tone: 'error' },
};

const OPERATOR_LABELS = { gt: '大于', gte: '大于等于', eq: '等于', lt: '小于', lte: '小于等于' };
const EVALUATE_WHEN_LABELS = { all_finished: '全部比赛结束后', each_finished: '每场比赛结束时', halftime: '比赛进入半场后' };
const METRIC_LABELS = { total_goals: '总进球数', goal_difference: '比分差', home_trailing: '主队落后客队' };
const FINISHED = new Set(['FT', 'AET', 'PEN']);
const DEFAULT_AUDIO_URL = '/default-alert.mp3';
const DEFAULT_AUDIO_NAME = '刘欢 - 好汉歌';
const REGION_COUNTRIES = {
  europe: new Set(['England', 'France', 'Germany', 'Italy', 'Spain', 'Portugal', 'Netherlands', 'Belgium', 'Scotland', 'Austria', 'Switzerland', 'Türkiye', 'Turkey', 'Greece', 'Denmark', 'Norway', 'Sweden', 'Poland', 'Czech-Republic', 'Croatia', 'Serbia', 'Romania', 'Ukraine', 'Armenia', 'Azerbaijan', 'Georgia', 'Kazakhstan']),
  west_asia: new Set(['Saudi-Arabia', 'Qatar', 'United-Arab-Emirates', 'Bahrain', 'Kuwait', 'Oman', 'Jordan', 'Iraq', 'Iran', 'Israel']),
  asia: new Set(['China', 'Japan', 'South-Korea', 'Thailand', 'Vietnam', 'Indonesia', 'Malaysia', 'Singapore', 'Australia', 'India', 'Uzbekistan']),
  south_america: new Set(['Brazil', 'Argentina', 'Chile', 'Uruguay', 'Colombia', 'Ecuador', 'Peru', 'Paraguay', 'Bolivia', 'Venezuela']),
};

function fixtureRegion(fixture) {
  const country = fixture.league.country || fixture.league.name.split(' · ')[0];
  if (REGION_COUNTRIES.europe.has(country) || country === '英格兰') return 'europe';
  if (REGION_COUNTRIES.west_asia.has(country) || country === '沙特阿拉伯') return 'west_asia';
  if (REGION_COUNTRIES.asia.has(country)) return 'asia';
  if (REGION_COUNTRIES.south_america.has(country) || country === '巴西') return 'south_america';
  return 'other';
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

function defaultStartAt(monitorDate) {
  if (monitorDate === localDateValue()) return localDateTimeValue();
  return `${monitorDate}T18:00`;
}

function monitorDateLabel(value) {
  if (value === localDateValue()) return '今天';
  if (value === shiftedDateValue(1)) return '明天';
  if (value === shiftedDateValue(2)) return '后天';
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(`${value}T12:00:00`));
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

function MatchCard({ fixture, selected, onToggle, compact = false, translations = {} }) {
  const live = ['1H', '2H', 'HT', 'ET'].includes(fixture.fixture.status.short);
  const finished = FINISHED.has(fixture.fixture.status.short);
  const homeOriginal = fixture.teams.home.name;
  const awayOriginal = fixture.teams.away.name;
  const homeName = fixture.teams.home.zhName || translations[homeOriginal] || homeOriginal;
  const awayName = fixture.teams.away.zhName || translations[awayOriginal] || awayOriginal;
  return (
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
  );
}

function TaskListItem({ task, active, onClick }) {
  return (
    <button className={`task-item ${active ? 'task-item--active' : ''}`} onClick={onClick}>
      <span className="task-item__icon"><Radio size={16} /></span>
      <span className="task-item__copy">
        <strong>{task.name}</strong>
        <small>{task.fixtures.length} 场 · {task.intervalMinutes} 分钟</small>
      </span>
      <StatusPill status={task.status} />
    </button>
  );
}

function CreateTaskPanel({ fixtures, selectedIds, setSelectedIds, monitorDate, translations, onClose, onCreated, onError, onArmSound }) {
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: '今晚比分提醒',
    startMode: 'scheduled',
    startAt: defaultStartAt(monitorDate),
    intervalMinutes: 3,
    evaluateWhen: 'all_finished',
    matchScope: 'any',
    metric: 'total_goals',
    operator: 'gt',
    threshold: 2,
  });

  const selectedFixtures = fixtures.filter((item) => selectedIds.includes(item.fixture.id));
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const updateMetric = (metric) => setForm((current) => metric === 'home_trailing'
    ? { ...current, metric, evaluateWhen: 'halftime', operator: 'lt', threshold: 0 }
    : { ...current, metric });
  const toggleFixture = (fixture) => setSelectedIds((current) => current.includes(fixture.fixture.id)
    ? current.filter((id) => id !== fixture.fixture.id)
    : [...current, fixture.fixture.id]);

  async function submit(event) {
    event.preventDefault();
    onArmSound();
    setSubmitting(true);
    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          monitorDate,
          startAt: form.startMode === 'now' ? new Date().toISOString() : new Date(form.startAt).toISOString(),
          fixtures: selectedFixtures,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || '创建任务失败');
      onCreated(body.task);
    } catch (error) {
      onError(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  const ruleSummary = form.metric === 'home_trailing'
    ? `当${EVALUATE_WHEN_LABELS[form.evaluateWhen]}，如果${form.matchScope === 'any' ? '任意一场' : '全部比赛'}主队比分低于客队，播放提醒。`
    : `当${EVALUATE_WHEN_LABELS[form.evaluateWhen]}，如果${form.matchScope === 'any' ? '任意一场' : '全部比赛'}的${METRIC_LABELS[form.metric]}${OPERATOR_LABELS[form.operator]} ${form.threshold}，播放提醒。`;

  return (
    <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <aside className="task-drawer" role="dialog" aria-modal="true" aria-labelledby="create-task-title">
        <div className="task-drawer__header">
          <div><p className="section-caption">新建任务</p><h2 id="create-task-title">设置监控条件</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="关闭"><X size={20} /></button>
        </div>
        <form onSubmit={submit}>
          <section className="form-section">
            <div className="form-section__title"><span>01</span><div><strong>选择目标</strong><small>已选择 {selectedFixtures.length} 场比赛</small></div></div>
            <div className="monitor-date-summary"><CalendarDays size={17} /><span>监控日期</span><strong>{monitorDateLabel(monitorDate)} · {monitorDate}</strong></div>
            <label className="field"><span>任务名称</span><input value={form.name} onChange={(event) => update('name', event.target.value)} /></label>
            <div className="drawer-fixtures">
              {fixtures.map((fixture) => <MatchCard key={fixture.fixture.id} fixture={fixture} compact translations={translations} selected={selectedIds.includes(fixture.fixture.id)} onToggle={toggleFixture} />)}
            </div>
          </section>

          <section className="form-section">
            <div className="form-section__title"><span>02</span><div><strong>启动时间</strong><small>到点立即执行首次检查</small></div></div>
            <div className="segmented">
              <button type="button" className={form.startMode === 'now' ? 'is-active' : ''} onClick={() => update('startMode', 'now')}>立即开始</button>
              <button type="button" className={form.startMode === 'scheduled' ? 'is-active' : ''} onClick={() => update('startMode', 'scheduled')}>定时开始</button>
            </div>
            {form.startMode === 'scheduled' && <label className="field"><span>开始时间 · Asia/Shanghai</span><input type="datetime-local" value={form.startAt} onChange={(event) => update('startAt', event.target.value)} /></label>}
            <label className="field"><span>监控频次</span><div className="input-unit"><input type="number" min="1" max="1440" value={form.intervalMinutes} onChange={(event) => update('intervalMinutes', event.target.value)} /><em>分钟 / 次</em></div></label>
            <div className="quick-values">{[1, 3, 5, 10].map((value) => <button type="button" key={value} className={Number(form.intervalMinutes) === value ? 'is-active' : ''} onClick={() => update('intervalMinutes', value)}>{value} 分钟</button>)}</div>
          </section>

          <section className="form-section">
            <div className="form-section__title"><span>03</span><div><strong>触发规则</strong><small>支持半场后主队落后提醒</small></div></div>
            <div className="field-grid">
              <label className="field"><span>判断时机</span><select value={form.evaluateWhen} onChange={(event) => update('evaluateWhen', event.target.value)}><option value="halftime">比赛进入半场后</option><option value="all_finished">全部比赛结束后</option><option value="each_finished">每场比赛结束时</option></select></label>
              <label className="field"><span>比赛范围</span><select value={form.matchScope} onChange={(event) => update('matchScope', event.target.value)}><option value="any">任意一场</option><option value="all">全部比赛</option></select></label>
              <label className="field"><span>监控指标</span><select value={form.metric} onChange={(event) => updateMetric(event.target.value)}><option value="home_trailing">主队落后客队</option><option value="total_goals">总进球数</option><option value="goal_difference">比分差</option></select></label>
              {form.metric !== 'home_trailing' && <label className="field"><span>比较条件</span><div className="condition-fields"><select value={form.operator} onChange={(event) => update('operator', event.target.value)}>{Object.entries(OPERATOR_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><input type="number" min="0" value={form.threshold} onChange={(event) => update('threshold', event.target.value)} /></div></label>}
            </div>
            <div className="rule-summary"><Sparkles size={18} /><p>{ruleSummary}</p></div>
          </section>

          <div className="task-drawer__actions">
            <button type="button" className="button button--ghost" onClick={onClose}>取消</button>
            <button className="button button--primary" disabled={submitting || !selectedFixtures.length}>{submitting ? <LoaderCircle className="spin" size={17} /> : <Radio size={17} />}启动监控</button>
          </div>
        </form>
      </aside>
    </div>
  );
}

function TaskDetail({ task, translations, onAction }) {
  if (!task) return null;
  const meta = STATUS_META[task.status] || STATUS_META.stopped;
  return (
    <section className="task-detail">
      <div className="task-detail__header">
        <div><div className="task-detail__kicker"><StatusPill status={task.status} /><span>ID {task.id.slice(0, 8)}</span></div><h2>{task.name}</h2><p>{task.error ? '本轮比分更新失败，提醒条件尚未重新判断' : task.lastMessage}</p></div>
        <div className="task-detail__actions">
          {['stopped', 'triggered', 'error'].includes(task.status) && <button className="button button--secondary" onClick={() => onAction(task.id, 'run')}><Play size={16} />{task.status === 'error' ? '立即重试' : '再次启动'}</button>}
          {['scheduled', 'running', 'error'].includes(task.status) && <button className="button button--secondary" onClick={() => onAction(task.id, 'stop')}><CircleStop size={16} />停止</button>}
          <button className="icon-button icon-button--danger" onClick={() => onAction(task.id, 'delete')} aria-label="删除任务"><Trash2 size={18} /></button>
        </div>
      </div>

      <div className="metric-strip">
        <div><Clock3 size={18} /><span>开始时间<strong>{formatDateTime(task.startAt)}</strong></span></div>
        <div><RefreshCw size={18} /><span>监控频次<strong>{task.intervalMinutes} 分钟</strong></span></div>
        <div><Activity size={18} /><span>实际 API 消耗<strong>{task.requestCount} 次</strong></span></div>
        <div><AlarmClock size={18} /><span>{task.status === 'scheduled' ? '计划启动' : '下次检查'}<strong>{formatDateTime(task.status === 'scheduled' ? task.startAt : task.nextCheckAt)}</strong></span></div>
      </div>

      <div className={`monitor-beam monitor-beam--${meta.tone}`}>
        <div className="monitor-beam__copy"><span>提醒规则</span><strong>{task.status === 'running' ? '正在监控' : meta.label}</strong></div>
        <div className="monitor-beam__rule">{EVALUATE_WHEN_LABELS[task.evaluateWhen] || '全部比赛结束后'} · {task.matchScope === 'any' ? '任意一场' : '全部比赛'} · {task.metric === 'home_trailing' ? '主队落后客队' : `${METRIC_LABELS[task.metric] || '总进球数'} ${OPERATOR_LABELS[task.operator]} ${task.threshold}`}</div>
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
  const [health, setHealth] = useState({ apiConfigured: false, mode: 'demo' });
  const [tasks, setTasks] = useState([]);
  const [fixtures, setFixtures] = useState(() => {
    try {
      const saved = localStorage.getItem('matchPulse:fixtures');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [fixtureMeta, setFixtureMeta] = useState(() => {
    try {
      const saved = localStorage.getItem('matchPulse:fixtureMeta');
      return saved ? JSON.parse(saved) : { cache: null, quota: null };
    } catch {
      return { cache: null, quota: null };
    }
  });
  const [hasQueriedFixtures, setHasQueriedFixtures] = useState(() => {
    return localStorage.getItem('matchPulse:hasQueried') === '1';
  });
  const [activeTaskId, setActiveTaskId] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [date, setDate] = useState(localDateValue());
  const [regionFilter, setRegionFilter] = useState('all');
  const [fixtureSearch, setFixtureSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(24);
  const [loadingFixtures, setLoadingFixtures] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [audioUrl, setAudioUrl] = useState(DEFAULT_AUDIO_URL);
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
  const audioRef = useRef(null);
  const audioContextRef = useRef(null);
  const customAudioUrlRef = useRef('');
  const translationRequestsRef = useRef(new Set());

  const activeTask = useMemo(() => tasks.find((task) => task.id === activeTaskId) || tasks[0] || null, [tasks, activeTaskId]);
  const runningCount = tasks.filter((task) => ['running', 'scheduled'].includes(task.status)).length;
  const visibleFixtures = useMemo(() => {
    const keyword = fixtureSearch.trim().toLocaleLowerCase();
    return fixtures
      .filter((fixture) => regionFilter === 'all' || fixtureRegion(fixture) === regionFilter)
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
  }, [fixtures, regionFilter, fixtureSearch, teamTranslations]);
  const displayedFixtures = useMemo(() => visibleFixtures.slice(0, visibleCount), [visibleFixtures, visibleCount]);

  function showToast(message) {
    setToast(message);
    window.setTimeout(() => setToast(''), 3200);
  }

  async function loadFixtures() {
    setLoadingFixtures(true);
    try {
      const response = await fetch(`/api/fixtures?date=${date}&timezone=Asia/Shanghai`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || '赛程加载失败');
      setFixtures(body.fixtures);
      setFixtureMeta({ cache: body.cache || null, quota: body.quota || null });
      setHasQueriedFixtures(true);
      localStorage.setItem('matchPulse:fixtures', JSON.stringify(body.fixtures));
      localStorage.setItem('matchPulse:fixtureMeta', JSON.stringify({ cache: body.cache || null, quota: body.quota || null }));
      localStorage.setItem('matchPulse:hasQueried', '1');
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
    localStorage.removeItem('matchPulse:fixtures');
    localStorage.removeItem('matchPulse:fixtureMeta');
    localStorage.setItem('matchPulse:hasQueried', '0');
  }

  function acceptApiKeyState(body) {
    setHealth(body);
    setApiKeys(body.apiKeys || []);
    setFixtures([]);
    setSelectedIds([]);
    setFixtureMeta({ cache: null, quota: null });
    setHasQueriedFixtures(false);
    localStorage.removeItem('matchPulse:fixtures');
    localStorage.removeItem('matchPulse:fixtureMeta');
    localStorage.setItem('matchPulse:hasQueried', '0');
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
      acceptApiKeyState(body);
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
    if (!window.confirm(`确定删除“${item.label}”（${item.hint}）吗？`)) return;
    setDeletingApiKeyId(item.id);
    try {
      const wasActive = item.id === health.activeApiKeyId;
      const response = await fetch(`/api/settings/api-keys/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'API Key 删除失败');
      if (editingApiKeyId === item.id) cancelApiKeyEdit();
      if (wasActive) acceptApiKeyState(body);
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
      acceptApiKeyState(body);
      showToast(`已切换到 ${body.apiKeyHint}，请点击“查询比赛”验证`);
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

  async function loadTasks() {
    const response = await fetch('/api/tasks');
    const body = await response.json();
    setTasks(body.tasks || []);
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

  function playSelectedAudio() {
    if (!audioRef.current) return;
    audioRef.current.currentTime = 0;
    audioRef.current.volume = 1;
    audioRef.current.play().catch(() => {
      playBuiltInAlert();
      showToast('歌曲播放失败，已改用提示音');
    });
  }

  function playAlert() {
    if (!soundEnabled) {
      showToast('提醒已触发，请点击“启用声音”后试听');
      return;
    }
    playSelectedAudio();
  }

  async function enableSound(preview = true) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!audioContextRef.current) audioContextRef.current = new AudioContext();
    await audioContextRef.current.resume();
    setSoundEnabled(true);
    if (preview) playBuiltInAlert();
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
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
    await enableSound(false);
    try {
      await saveAudio(file);
      showToast('提醒歌曲已保存，下次会自动使用');
    } catch {
      showToast('歌曲可在本次使用，但浏览器未能持久保存');
    }
  }

  useEffect(() => {
    Promise.all([
      fetch('/api/health').then((response) => response.json()),
      fetch('/api/tasks').then((response) => response.json()),
      fetch('/api/team-translations/known').then((response) => response.json()),
    ])
      .then(([healthBody, tasksBody, translationsBody]) => {
        setHealth(healthBody);
        setTasks(tasksBody.tasks || []);
        setTeamTranslations(translationsBody.translations || {});
      })
      .catch(() => showToast('无法连接监控服务'));
  }, []);

  useEffect(() => {
    loadSavedAudio().then((saved) => {
      if (!saved?.blob) return;
      const savedUrl = URL.createObjectURL(saved.blob);
      customAudioUrlRef.current = savedUrl;
      setAudioUrl(savedUrl);
      setAudioName(saved.name);
      setCustomAudioSelected(true);
    }).catch(() => showToast('未能读取上一次设置的歌曲'));
    return () => {
      if (customAudioUrlRef.current) URL.revokeObjectURL(customAudioUrlRef.current);
    };
  }, []);

  useEffect(() => { setVisibleCount(24); }, [date, regionFilter, fixtureSearch]);

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
        <a className="brand" href="#top" aria-label="比分提醒首页"><span className="brand__mark"><Activity size={19} /></span><span>比分提醒</span></a>
        <nav className="topbar__nav" aria-label="页面导航"><a href="#fixtures">比赛</a><a href="#tasks">任务</a></nav>
        <div className="topbar__actions">
          <button className={`api-state ${health.activeApiKeyStatus === 'error' ? 'api-state--error' : health.apiConfigured ? 'api-state--live' : ''}`} onClick={openApiKeySettings} title="管理、测试和切换比分 API">{health.activeApiKeyStatus === 'error' ? <Zap size={16} /> : <KeyRound size={16} />}<span>{health.apiConfigured ? `${health.providerLabel || 'API'} ${health.apiKeyHint || '已配置'}${health.activeApiKeyStatus === 'error' ? ' · 异常' : ''}${health.apiKeyCount > 1 ? ` · ${health.apiKeyCount} 个` : ''}` : '导入 API Key'}</span></button>
          <button className={`sound-control ${soundEnabled ? 'sound-control--on' : ''}`} onClick={() => enableSound(true)}><Volume2 size={17} />{soundEnabled ? '声音已启用' : '启用声音'}</button>
          <button className="button button--primary button--small" onClick={() => setDrawerOpen(true)}><Plus size={17} />新建监控</button>
        </div>
      </header>

      <aside className="sidebar" id="tasks">
        <div className="sidebar__label"><span>监控任务</span><strong>{tasks.length}</strong></div>
        <nav className="task-list" aria-label="监控任务列表">
          {tasks.map((task) => <TaskListItem key={task.id} task={task} active={activeTask?.id === task.id} onClick={() => setActiveTaskId(task.id)} />)}
          {!tasks.length && <p className="sidebar__empty">暂无任务<br />从右上角创建第一个监控</p>}
        </nav>
        <div className="sound-card">
          <span className="sound-card__icon"><Headphones size={19} /></span>
          <div><small>{customAudioSelected ? '上次选择' : '默认提醒歌曲'}</small><strong title={audioName}>{audioName}</strong></div>
          <button className="icon-button" aria-label="试听提醒歌曲" onClick={async () => { await enableSound(false); playSelectedAudio(); }}><Play size={16} /></button>
          <label className="icon-button" aria-label="上传提醒音乐"><Music2 size={17} /><input type="file" accept="audio/*" onChange={handleAudioFile} /></label>
          <audio ref={audioRef} src={audioUrl} preload="auto" />
        </div>
      </aside>

      <main id="top" className="workspace">
        <section className="page-header">
          <div className="page-header__copy">
            <p className="section-caption">比赛比分提醒</p>
            <h1>比赛监控</h1>
            <p>选择比赛、设置开始时间和触发条件，达成后播放提醒歌曲。</p>
          </div>
          <dl className="summary-list">
            <div><dt>进行中的任务</dt><dd>{runningCount}</dd></div>
            <div><dt>当前日期赛事</dt><dd>{fixtures.length}</dd></div>
            <div><dt>默认监控频次</dt><dd>3 <small>分钟</small></dd></div>
          </dl>
        </section>

        {!health.apiConfigured && <div className="demo-notice" role="status"><CloudCog size={18} /><div><strong>当前显示演示比赛</strong><span>尚未连接 API-Football，页面中的比赛不是真实赛程。</span></div></div>}

        <section className="content-grid" id="fixtures">
          <div className="fixture-browser">
            <div className="section-heading">
              <div className="section-heading__copy"><span className="section-index">1</span><div><h2>选择{monitorDateLabel(date)}的比赛</h2><p>{date} · 共 {visibleFixtures.length} 场{fixtureMeta.quota?.remaining != null ? ` · 今日剩余 ${fixtureMeta.quota.remaining}/${fixtureMeta.quota.limit}` : ''}{fixtureMeta.cache ? ` · ${fixtureMeta.cache.source === 'api' ? '刚从 API 更新' : '已使用服务端缓存'}` : ''}</p></div></div>
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
              {[['all', '全部赛事'], ['europe', '欧洲'], ['west_asia', '西亚'], ['asia', '亚洲'], ['south_america', '南美']].map(([value, label], index) => (
                <button key={value} className={`filter-chip ${regionFilter === value ? 'filter-chip--active' : ''}`} onClick={() => setRegionFilter(value)}>{index === 0 && <ListFilter size={14} />}{label}</button>
              ))}
              <label className="fixture-search"><Search size={14} /><input value={fixtureSearch} onChange={(event) => setFixtureSearch(event.target.value)} placeholder="搜索球队或联赛" aria-label="搜索球队或联赛" /></label>
              <span>{selectedIds.length} 场已选择</span>
            </div>
            {loadingFixtures ? <div className="loading-state"><LoaderCircle className="spin" /><span>正在查询比赛…</span></div> : visibleFixtures.length ? <><div className="fixture-grid">{displayedFixtures.map((fixture) => <MatchCard key={fixture.fixture.id} fixture={fixture} translations={teamTranslations} selected={selectedIds.includes(fixture.fixture.id)} onToggle={toggleFixture} />)}</div>{visibleCount < visibleFixtures.length && <button className="load-more" onClick={() => setVisibleCount((count) => count + 24)}>显示更多比赛（剩余 {visibleFixtures.length - visibleCount} 场）</button>}</> : <div className="loading-state"><Search /><span>{hasQueriedFixtures ? '没有找到符合条件的比赛' : '选择日期后点击“查询比赛”，页面不会自动消耗 API 额度'}</span></div>}
            {selectedIds.length > 0 && <div className="selection-bar"><div><Check size={17} /><span>已锁定 <strong>{selectedIds.length}</strong> 场目标</span></div><button className="button button--primary button--small" onClick={() => setDrawerOpen(true)}>配置规则<ChevronRight size={16} /></button></div>}
          </div>
        </section>

        {activeTask ? <TaskDetail task={activeTask} translations={teamTranslations} onAction={taskAction} /> : <EmptyState onCreate={() => setDrawerOpen(true)} />}
      </main>

      {drawerOpen && <CreateTaskPanel fixtures={fixtures} selectedIds={selectedIds} setSelectedIds={setSelectedIds} monitorDate={date} translations={teamTranslations} onClose={() => setDrawerOpen(false)} onError={showToast} onArmSound={() => enableSound(false)} onCreated={(task) => { setDrawerOpen(false); setSelectedIds([]); setActiveTaskId(task.id); loadTasks(); showToast('监控任务已创建，声音提醒已启用'); }} />}

      {apiKeyOpen && <div className="alert-overlay" onMouseDown={(event) => event.target === event.currentTarget && setApiKeyOpen(false)}><form className="alert-dialog api-key-dialog" onSubmit={importApiKey}><span className="alert-dialog__icon"><KeyRound size={30} /></span><p className="section-caption">API 设置</p><h2>管理比分 API</h2><p>每个 Key 绑定一个平台；修改现有 Key 的平台后，需要重新测试连接。</p>{loadingApiKeys ? <div className="api-key-list__loading"><LoaderCircle className="spin" size={18} />正在读取…</div> : apiKeys.length > 0 && <div className="api-key-list" role="list">{apiKeys.map((item) => <div role="listitem" key={item.id} className={`api-key-item ${item.active ? 'api-key-item--active' : ''} ${item.testStatus === 'error' ? 'api-key-item--error' : ''}`}><button type="button" className="api-key-item__select" onClick={() => switchApiKey(item.id)} disabled={Boolean(switchingApiKeyId || testingApiKeyId || deletingApiKeyId || savingApiKey)}><span><strong>{item.label}</strong><small>{health.providers?.find((provider) => provider.id === item.provider)?.label || item.provider} · {item.hint}{item.source === 'environment' ? ' · 环境变量' : ''}</small><small className={`api-key-item__health api-key-item__health--${item.testStatus}`}>{item.testStatus === 'healthy' ? `连接正常${item.testQuota?.remaining != null ? ` · 剩余 ${item.testQuota.remaining}/${item.testQuota.limit}` : ''}` : item.testStatus === 'error' ? `连接异常 · ${item.testMessage}` : '尚未测试'}</small></span>{item.active ? <em><Check size={14} />使用中</em> : switchingApiKeyId === item.id ? <LoaderCircle className="spin" size={16} /> : <em>切换</em>}</button><button type="button" className="api-key-item__edit" onClick={() => editApiKey(item)} disabled={Boolean(testingApiKeyId || switchingApiKeyId || deletingApiKeyId || savingApiKey || item.source === 'environment')} title={item.source === 'environment' ? '环境变量 Key 请修改服务器配置' : '修改名称和绑定平台'}><Pencil size={13} />编辑</button><button type="button" className="api-key-item__test" onClick={() => testApiKey(item.id)} disabled={Boolean(testingApiKeyId || switchingApiKeyId || deletingApiKeyId || savingApiKey)}>{testingApiKeyId === item.id ? <LoaderCircle className="spin" size={14} /> : <Activity size={14} />}测试</button><button type="button" className="api-key-item__delete" onClick={() => deleteApiKey(item)} disabled={Boolean(testingApiKeyId || switchingApiKeyId || deletingApiKeyId || savingApiKey || item.source === 'environment')} title={item.source === 'environment' ? '环境变量 Key 请从服务器配置中删除' : '删除 API Key'}>{deletingApiKeyId === item.id ? <LoaderCircle className="spin" size={14} /> : <Trash2 size={14} />}</button></div>)}</div>}<div className="api-key-form">{editingApiKeyId && <div className="api-key-editing">正在修改现有 Key；保存后将使用新平台重新测试，Key 内容保持不变。</div>}<label className="field"><span>{editingApiKeyId ? '绑定平台' : 'API 平台'}</span><select value={apiProviderId} onChange={(event) => setApiProviderId(event.target.value)}>{(health.providers || [{ id: 'api-football', label: 'API-Football' }, { id: 'the-stats-api', label: 'TheStatsAPI' }, { id: 'the-sports-db', label: 'TheSportsDB' }]).map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}</select></label><label className="field"><span>名称（可选）</span><input maxLength="40" value={apiKeyLabel} onChange={(event) => setApiKeyLabel(event.target.value)} placeholder="例如：比分备用账号" /></label>{!editingApiKeyId && <label className="field"><span>新增 API Key</span><input type="password" autoComplete="off" value={apiKeyValue} onChange={(event) => setApiKeyValue(event.target.value)} placeholder={apiProviderId === 'the-sports-db' ? '免费 Key 可填写 123' : '粘贴对应平台的 API Key'} /></label>}</div><div className="api-key-dialog__actions"><button type="button" className="button button--ghost" onClick={editingApiKeyId ? cancelApiKeyEdit : () => setApiKeyOpen(false)}>{editingApiKeyId ? '取消修改' : '完成'}</button><button className="button button--primary" disabled={savingApiKey || deletingApiKeyId || (!editingApiKeyId && !apiKeyValue.trim())}>{savingApiKey ? <LoaderCircle className="spin" size={17} /> : <KeyRound size={17} />}{editingApiKeyId ? '保存修改' : '保存并启用'}</button></div></form></div>}

      {alertTask && <div className="alert-overlay"><div className="alert-dialog"><span className="alert-dialog__icon"><BellRing size={32} /></span><p className="section-caption">监控提醒</p><h2>比分条件已达成</h2><p>{alertTask.lastMessage}</p><button className="button button--primary" onClick={() => { if (audioRef.current) audioRef.current.pause(); setAlertTask(null); }}>收到，停止提醒</button></div></div>}
      {toast && <div className="toast"><Check size={16} />{toast}</div>}
    </div>
  );
}
