const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'store.json');

const readStore = () => JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
function writeStore(store) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const temporary = `${DATA_FILE}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(store, null, 2)}\n`);
  fs.renameSync(temporary, DATA_FILE);
}
function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}
function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', chunk => {
      body += chunk;
      if (body.length > 1_000_000) reject(new Error('Request is too large'));
    });
    request.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error('Invalid JSON')); }
    });
    request.on('error', reject);
  });
}
function validateMeeting(meeting) {
  if (!meeting.title?.trim() || !meeting.date || !['transcript', 'minutes'].includes(meeting.inputType) || !meeting.text?.trim()) return 'Title, meeting date, input type, and meeting text are required.';
  if (!Array.isArray(meeting.participants) || !meeting.participants.length || meeting.participants.some(person => !person.name?.trim() || !person.email?.trim() || !person.role?.trim())) return 'Every participant needs a name, email, and role.';
  return null;
}
function demoAnalysis(input) {
  const ownerA = input.participants[0]?.name || 'Project Lead';
  const ownerB = input.participants[1]?.name || ownerA;
  const base = new Date(`${input.date}T12:00:00Z`);
  const deadline = days => { const value = new Date(base); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); };
  return {
    id: randomUUID(), title: input.title.trim(), date: input.date, inputType: input.inputType,
    sourceText: input.text.trim(), participants: input.participants,
    minutes: input.inputType === 'minutes' ? input.text : `The group met to discuss ${input.title}. The team reviewed current priorities, agreed the next deliverables, and confirmed that progress will be reported before the next meeting.`,
    demo: true, approved: false, createdAt: new Date().toISOString(),
    tasks: [
      { id: randomUUID(), task: 'Consolidate the research findings into the shared project outline', owner: ownerA, deadline: deadline(7), ownerProposed: input.inputType === 'transcript', deadlineProposed: true, status: 'Not started', latestUpdate: 'Awaiting chair approval' },
      { id: randomUUID(), task: 'Prepare a first draft of the presentation slides', owner: ownerB, deadline: deadline(10), ownerProposed: input.participants.length < 2, deadlineProposed: true, status: 'Not started', latestUpdate: 'Awaiting chair approval' }
    ]
  };
}
function serveStatic(response, pathname) {
  const requested = pathname === '/' ? '/index.html' : pathname;
  const file = path.resolve(PUBLIC_DIR, `.${requested}`);
  if (!file.startsWith(`${PUBLIC_DIR}${path.sep}`)) return json(response, 403, { error: 'Forbidden' });
  const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
  fs.readFile(file, (error, contents) => {
    if (error) return json(response, 404, { error: 'Not found' });
    response.writeHead(200, { 'Content-Type': `${types[path.extname(file)] || 'application/octet-stream'}; charset=utf-8` });
    response.end(contents);
  });
}
async function handler(request, response) {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  try {
    if (request.method === 'GET' && pathname === '/api/state') return json(response, 200, readStore());
    if (request.method === 'POST' && pathname === '/api/meetings/analyse') {
      const input = await readJson(request);
      const error = validateMeeting(input);
      if (error) return json(response, 400, { error });
      const store = readStore();
      const meeting = demoAnalysis(input);
      store.meetings.unshift(meeting); writeStore(store);
      return json(response, 201, meeting);
    }
    const meetingMatch = pathname.match(/^\/api\/meetings\/([^/]+)$/);
    if (request.method === 'PUT' && meetingMatch) {
      const changes = await readJson(request); const store = readStore();
      const index = store.meetings.findIndex(item => item.id === meetingMatch[1]);
      if (index < 0) return json(response, 404, { error: 'Meeting not found' });
      const current = store.meetings[index];
      store.meetings[index] = { ...current, minutes: changes.minutes ?? current.minutes, tasks: Array.isArray(changes.tasks) ? changes.tasks : current.tasks };
      writeStore(store); return json(response, 200, store.meetings[index]);
    }
    const approveMatch = pathname.match(/^\/api\/meetings\/([^/]+)\/approve$/);
    if (request.method === 'POST' && approveMatch) {
      const store = readStore(); const meeting = store.meetings.find(item => item.id === approveMatch[1]);
      if (!meeting) return json(response, 404, { error: 'Meeting not found' });
      meeting.approved = true; meeting.approvedAt = new Date().toISOString();
      meeting.tasks.forEach(task => {
        if (task.latestUpdate === 'Awaiting chair approval') task.latestUpdate = 'Approved and assigned';
        const tracked = { ...task, meetingId: meeting.id, meetingTitle: meeting.title };
        const existing = store.tasks.findIndex(item => item.id === task.id);
        if (existing >= 0) store.tasks[existing] = tracked; else store.tasks.push(tracked);
      });
      writeStore(store); return json(response, 200, meeting);
    }
    const taskMatch = pathname.match(/^\/api\/tasks\/([^/]+)$/);
    if (request.method === 'PATCH' && taskMatch) {
      const changes = await readJson(request); const store = readStore();
      const task = store.tasks.find(item => item.id === taskMatch[1]);
      if (!task) return json(response, 404, { error: 'Task not found' });
      if (changes.status) task.status = changes.status;
      if (typeof changes.latestUpdate === 'string') task.latestUpdate = changes.latestUpdate.trim();
      task.updatedAt = new Date().toISOString(); writeStore(store); return json(response, 200, task);
    }
    if (request.method === 'GET' && !pathname.startsWith('/api/')) return serveStatic(response, pathname);
    return json(response, 404, { error: 'Not found' });
  } catch (error) { return json(response, error.message === 'Invalid JSON' ? 400 : 500, { error: error.message }); }
}
function createServer() { return http.createServer(handler); }
if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  createServer().listen(port, '0.0.0.0', () => console.log(`Meeting-to-Action Assistant running at http://localhost:${port}`));
}
module.exports = { createServer };
