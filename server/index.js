import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { evaluateTask } from './rules.js';
import { createFootballClient, retryDelay } from './footballClient.js';
import { getKnownTeamTranslations, translateTeamNames } from './teamTranslations.js';
import { normalizeTaskSettings, validateTask } from './taskSettings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'data');
const tasksFile = path.join(dataDir, 'tasks.json');
const port = Number(process.env.PORT || 8787);
const apiKey = process.env.API_FOOTBALL_KEY || '';
const app = express();
const clients = new Set();

app.use(express.json({ limit: '1mb' }));

function demoFixtures(date) {
  const monitorDate = /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? date : new Date().toISOString().slice(0, 10);
  const kickoff = (time) => new Date(`${monitorDate}T${time}:00+08:00`).toISOString();
  return [
    {
      fixture: { id: 900001, date: kickoff('19:30'), status: { short: 'NS', long: 'Not Started', elapsed: null } },
      league: { id: 39, name: '英格兰 · 超级联赛', logo: '' },
      teams: { home: { id: 1, name: '北城竞技', logo: '' }, away: { id: 2, name: '海港联队', logo: '' } },
      goals: { home: null, away: null },
    },
    {
      fixture: { id: 900002, date: kickoff('20:15'), status: { short: 'NS', long: 'Not Started', elapsed: null } },
      league: { id: 307, name: '沙特阿拉伯 · 职业联赛', logo: '' },
      teams: { home: { id: 3, name: '利雅得星辰', logo: '' }, away: { id: 4, name: '吉达雄鹰', logo: '' } },
      goals: { home: null, away: null },
    },
    {
      fixture: { id: 900003, date: kickoff('21:00'), status: { short: 'NS', long: 'Not Started', elapsed: null } },
      league: { id: 71, name: '巴西 · 甲级联赛', logo: '' },
      teams: { home: { id: 5, name: '南岸体育', logo: '' }, away: { id: 6, name: '绿茵俱乐部', logo: '' } },
      goals: { home: null, away: null },
    },
  ];
}

function readTasks() {
  try {
    return JSON.parse(fs.readFileSync(tasksFile, 'utf8')).map(({ checking: _checking, ...task }) => task);
  } catch {
    return [];
  }
}

let tasks = readTasks();

function saveTasks() {
  fs.mkdirSync(dataDir, { recursive: true });
  const persistedTasks = tasks.map(({ checking: _checking, ...task }) => task);
  fs.writeFileSync(tasksFile, JSON.stringify(persistedTasks, null, 2));
}

function broadcast(event, payload) {
  const message = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  clients.forEach((client) => client.write(message));
}

const footballRequest = createFootballClient({ apiKey });

async function getTaskFixtures(task) {
  if (!apiKey) {
    return task.fixtures.map((item) => ({
      ...item,
      fixture: { ...item.fixture, status: { short: 'FT', long: 'Match Finished', elapsed: 90 } },
      goals: item.fixture.id === task.fixtures[0].fixture.id ? { home: 2, away: 1 } : { home: 1, away: 0 },
    }));
  }

  const selectedIds = new Set(task.fixtures.map((item) => String(item.fixture.id)));
  const monitorDate = task.monitorDate || task.fixtures[0]?.fixture?.date?.slice(0, 10);
  const result = await footballRequest('fixtures', { date: monitorDate, timezone: 'Asia/Shanghai' });
  const fixtures = result.data.filter((item) => selectedIds.has(String(item.fixture.id)));
  if (fixtures.length !== selectedIds.size) {
    throw new Error(`API 未返回全部所选比赛（${fixtures.length}/${selectedIds.size}），将在下次继续检查`);
  }
  return fixtures;
}

async function runTask(task) {
  const revision = task.revision || 0;
  const isCurrent = () => tasks.includes(task) && (task.revision || 0) === revision;
  const now = new Date().toISOString();
  if (apiKey) task.requestCount += 1;
  try {
    const fixtures = await getTaskFixtures(task);
    if (!isCurrent()) return;
    const result = evaluateTask(task, fixtures);
    task.fixtures = fixtures;
    task.lastCheckedAt = now;
    task.lastSucceededAt = new Date().toISOString();
    task.consecutiveFailures = 0;
    task.errorCode = null;
    task.lastMessage = result.reason;
    task.error = null;
    if (result.matched) {
      task.status = 'triggered';
      task.triggeredAt = now;
      task.triggerFixtureId = result.fixtureId;
      task.nextCheckAt = null;
      broadcast('task-triggered', task);
    } else {
      task.status = 'running';
      task.nextCheckAt = new Date(Date.now() + task.intervalMinutes * 60_000).toISOString();
    }
  } catch (error) {
    if (!isCurrent()) return;
    task.status = 'error';
    task.error = error.message;
    task.errorCode = error.code || 'FIXTURES';
    task.consecutiveFailures = (task.consecutiveFailures || 0) + 1;
    task.lastMessage = '本轮未获取到最新比分，等待自动重试';
    task.lastCheckedAt = now;
    task.nextCheckAt = new Date(Date.now() + retryDelay(task.intervalMinutes, task.consecutiveFailures, error.retryAfterMs)).toISOString();
    broadcast('task-error', task);
  }
  saveTasks();
  broadcast('tasks-updated', tasks);
}

setInterval(() => {
  const now = Date.now();
  tasks.forEach((task) => {
    if (!['scheduled', 'running', 'error'].includes(task.status)) return;
    const dueAt = task.status === 'scheduled' ? Date.parse(task.startAt) : Date.parse(task.nextCheckAt || 0);
    if (dueAt <= now && !task.checking) {
      const check = Symbol();
      task.checking = check;
      runTask(task).finally(() => { if (task.checking === check) delete task.checking; });
    }
  });
}, 5_000);

app.get('/api/health', (_request, response) => {
  response.json({ ok: true, apiConfigured: Boolean(apiKey), mode: apiKey ? 'live' : 'demo' });
});

app.get('/api/fixtures', async (request, response) => {
  try {
    if (!apiKey) return response.json({ fixtures: demoFixtures(request.query.date), mode: 'demo', quota: null });
    const result = await footballRequest('fixtures', {
      date: request.query.date,
      timezone: request.query.timezone || 'Asia/Shanghai',
    });
    response.json({ fixtures: result.data, mode: 'live', quota: result.quota });
  } catch (error) {
    response.status(502).json({ error: error.message });
  }
});

app.post('/api/team-translations', async (request, response) => {
  const names = Array.isArray(request.body?.names) ? request.body.names : [];
  if (names.length > 80) return response.status(400).json({ error: '单次最多翻译 80 个球队名称' });
  try {
    response.json({ translations: await translateTeamNames(names) });
  } catch {
    response.status(502).json({ error: '球队名称翻译暂时不可用' });
  }
});

app.get('/api/team-translations/known', (_request, response) => {
  response.json({ translations: getKnownTeamTranslations() });
});

app.get('/api/tasks', (_request, response) => response.json({ tasks }));

app.post('/api/tasks', (request, response) => {
  const error = validateTask(request.body);
  if (error) return response.status(400).json({ error });
  const settings = normalizeTaskSettings(request.body);
  const task = {
    id: crypto.randomUUID(),
    ...settings,
    status: Date.parse(settings.startAt) > Date.now() ? 'scheduled' : 'running',
    nextCheckAt: settings.startAt,
    createdAt: new Date().toISOString(),
    lastCheckedAt: null,
    triggeredAt: null,
    requestCount: 0,
    lastMessage: '等待首次检查',
    error: null,
  };
  tasks.unshift(task);
  saveTasks();
  broadcast('tasks-updated', tasks);
  response.status(201).json({ task });
});

app.put('/api/tasks/:id', (request, response) => {
  const task = tasks.find((item) => item.id === request.params.id);
  if (!task) return response.status(404).json({ error: '任务不存在' });
  const error = validateTask(request.body);
  if (error) return response.status(400).json({ error });

  const settings = normalizeTaskSettings(request.body);
  task.revision = (task.revision || 0) + 1;
  Object.assign(task, settings, {
    consecutiveFailures: 0,
    errorCode: null,
    lastSucceededAt: null,
    status: Date.parse(settings.startAt) > Date.now() ? 'scheduled' : 'running',
    nextCheckAt: settings.startAt,
    lastCheckedAt: null,
    triggeredAt: null,
    triggerFixtureId: null,
    lastMessage: '设置已更新，等待首次检查',
    error: null,
  });
  delete task.checking;
  saveTasks();
  broadcast('tasks-updated', tasks);
  response.json({ task });
});

app.post('/api/tasks/:id/run', (request, response) => {
  const task = tasks.find((item) => item.id === request.params.id);
  if (!task) return response.status(404).json({ error: '任务不存在' });
  task.revision = (task.revision || 0) + 1;
  task.consecutiveFailures = 0;
  task.errorCode = null;
  task.lastMessage = '等待重新检查';
  task.status = 'running';
  task.startAt = new Date().toISOString();
  task.nextCheckAt = task.startAt;
  task.error = null;
  delete task.checking;
  saveTasks();
  broadcast('tasks-updated', tasks);
  response.json({ task });
});

app.post('/api/tasks/:id/stop', (request, response) => {
  const task = tasks.find((item) => item.id === request.params.id);
  if (!task) return response.status(404).json({ error: '任务不存在' });
  task.revision = (task.revision || 0) + 1;
  task.status = 'stopped';
  task.nextCheckAt = null;
  saveTasks();
  broadcast('tasks-updated', tasks);
  response.json({ task });
});

app.delete('/api/tasks/:id', (request, response) => {
  const initialLength = tasks.length;
  tasks = tasks.filter((item) => item.id !== request.params.id);
  if (tasks.length === initialLength) return response.status(404).json({ error: '任务不存在' });
  saveTasks();
  broadcast('tasks-updated', tasks);
  response.status(204).end();
});

app.get('/api/events', (request, response) => {
  response.setHeader('Content-Type', 'text/event-stream');
  response.setHeader('Cache-Control', 'no-cache');
  response.setHeader('Connection', 'keep-alive');
  response.flushHeaders();
  response.write(`event: connected\ndata: {}\n\n`);
  clients.add(response);
  request.on('close', () => clients.delete(response));
});

if (process.env.NODE_ENV === 'production' || process.argv.includes('--production')) {
  app.use(express.static(path.join(rootDir, 'dist')));
  app.use((_request, response) => response.sendFile(path.join(rootDir, 'dist', 'index.html')));
}

app.listen(port, () => {
  console.log(`Match Pulse server listening on http://localhost:${port}`);
});
