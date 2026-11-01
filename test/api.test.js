'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'codeforge-test-'));
Object.assign(process.env, {
  DATA_DIR: tmp,
  SESSION_SECRET: 'test-secret-'.padEnd(48, 'x'),
  ADMIN_USER: 'admin',
  ADMIN_PASSWORD: 'correct-horse-battery',
  EMAIL_MX_CHECK: 'false',
  ORDER_RATE_LIMIT: '1000',
  NODE_ENV: 'test',
});
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const { createApp } = require('../server/index');

let server, base, store;

// Forge a token issued 10 s ago so tests don't have to wait for the anti-bot delay.
function agedToken(ageMs = 10_000) {
  const payload = `${Date.now() - ageMs}.${crypto.randomBytes(9).toString('base64url')}`;
  const sig = crypto.createHmac('sha256', process.env.SESSION_SECRET).update(`form:${payload}`).digest('base64url');
  return `${payload}.${sig}`;
}

function orderForm(overrides = {}, files = []) {
  const fields = {
    project_name: 'Сервис онлайн-записи',
    description: 'Нужен сайт с онлайн-записью клиентов и личным кабинетом.',
    deadline: '1-3m',
    budget: '3000-5000',
    name: 'Анна',
    email: 'anna@example.com',
    phone: '+49 151 2345678',
    telegram: 'anna_salon',
    contact_method: 'telegram',
    consent: 'true',
    form_token: agedToken(),
    ...overrides,
  };
  const fd = new FormData();
  for (const s of overrides.services || ['website', 'ios']) fd.append('services', s);
  for (const [k, v] of Object.entries(fields)) if (k !== 'services') fd.append(k, v);
  for (const f of files) fd.append('files', new Blob([f.data], { type: f.type }), f.name);
  return fd;
}

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('rest-of-png')]);

before(async () => {
  const created = await createApp();
  store = created.store;
  await new Promise((resolve) => { server = created.app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((r) => server.close(r));
  await store.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('public pages, sitemap and robots are served', async () => {
  for (const [url, type] of [['/', 'text/html'], ['/projects/atlas-crm', 'text/html'], ['/privacy', 'text/html'], ['/sitemap.xml', 'application/xml'], ['/robots.txt', 'text/plain']]) {
    const res = await fetch(base + url);
    assert.equal(res.status, 200, url);
    assert.ok(res.headers.get('content-type').startsWith(type), url);
  }
  const sitemap = await (await fetch(`${base}/sitemap.xml`)).text();
  assert.match(sitemap, /\/projects\/nova-finance-dashboard/);
  const home = await (await fetch(base)).text();
  assert.doesNotMatch(home, /__SITE_URL__/);
  assert.equal((await fetch(`${base}/projects/nope`)).status, 404);
});

test('form token is required and too-fast submissions are rejected', async () => {
  let res = await fetch(`${base}/api/orders`, { method: 'POST', body: orderForm({ form_token: 'bogus' }) });
  assert.equal(res.status, 400);
  res = await fetch(`${base}/api/orders`, { method: 'POST', body: orderForm({ form_token: agedToken(500) }) });
  assert.equal((await res.json()).code, 'token_too_fast');
});

test('invalid fields return 422 with per-field messages', async () => {
  const res = await fetch(`${base}/api/orders`, {
    method: 'POST',
    body: orderForm({ email: 'not-an-email', description: 'коротко', services: ['nonsense'], telegram: '', contact_method: 'telegram' }),
  });
  assert.equal(res.status, 422);
  const body = await res.json();
  assert.ok(body.fields.email);
  assert.ok(body.fields.description);
  assert.ok(body.fields.services);
  assert.ok(body.fields.telegram, 'telegram required when chosen as contact method');
});

test('files with spoofed extensions are rejected; token can be reused after the fix', async () => {
  const token = agedToken();
  let res = await fetch(`${base}/api/orders`, {
    method: 'POST',
    body: orderForm({ form_token: token }, [{ name: 'evil.png', type: 'image/png', data: '<script>alert(1)</script>' }]),
  });
  assert.equal(res.status, 400);
  assert.ok((await res.json()).fields.files);
  res = await fetch(`${base}/api/orders`, {
    method: 'POST',
    body: orderForm({ form_token: token }, [{ name: 'page.svg', type: 'image/svg+xml', data: '<svg/>' }]),
  });
  assert.equal(res.status, 400, 'svg is not allowed');
});

let createdNumber;
test('valid order is stored with files and a unique number; tokens are single-use', async () => {
  const token = agedToken();
  const res = await fetch(`${base}/api/orders`, {
    method: 'POST',
    body: orderForm({ form_token: token }, [{ name: 'макет.png', type: 'image/png', data: PNG }]),
  });
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.match(body.number, /^CF-\d{6}-[2-9A-HJ-NP-Z]{5}$/);
  createdNumber = body.number;
  assert.equal(fs.readdirSync(path.join(tmp, 'uploads')).length, 1);

  const replay = await fetch(`${base}/api/orders`, { method: 'POST', body: orderForm({ form_token: token }) });
  assert.equal(replay.status, 409);
});

test('honeypot submissions look successful but are not stored', async () => {
  const res = await fetch(`${base}/api/orders`, { method: 'POST', body: orderForm({ company_site: 'http://spam' }) });
  assert.equal(res.status, 201);
  const { total } = await store.listOrders({});
  assert.equal(total, 1);
});

test('cross-origin POSTs are rejected', async () => {
  const res = await fetch(`${base}/api/orders`, { method: 'POST', headers: { Origin: 'https://evil.example' }, body: orderForm() });
  assert.equal(res.status, 403);
});

test('admin API: auth, list, search, filter, detail, status, file download, stats, CSV', async () => {
  assert.equal((await fetch(`${base}/api/admin/orders`)).status, 401);

  const bad = await fetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'nope' }) });
  assert.equal(bad.status, 401);

  const login = await fetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'correct-horse-battery' }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.match(login.headers.get('set-cookie'), /HttpOnly/);
  assert.match(login.headers.get('set-cookie'), /SameSite=Strict/);
  const get = (u) => fetch(base + u, { headers: { cookie } });

  let list = await (await get('/api/admin/orders?q=АННА')).json();
  assert.equal(list.total, 1, 'case-insensitive Cyrillic search');
  list = await (await get('/api/admin/orders?service=ios&budget=3000-5000&status=new')).json();
  assert.equal(list.total, 1);
  list = await (await get('/api/admin/orders?service=android')).json();
  assert.equal(list.total, 0);

  const id = (await (await get('/api/admin/orders')).json()).items[0].id;
  const detail = await (await get(`/api/admin/orders/${id}`)).json();
  assert.equal(detail.number, createdNumber);
  assert.deepEqual(detail.services, ['website', 'ios']);
  assert.equal(detail.files[0].original_name, 'макет.png');
  assert.equal(detail.ip_hash, undefined, 'internal fields are not exposed');

  const file = await get(`/api/admin/orders/${id}/files/${detail.files[0].id}`);
  assert.equal(file.status, 200);
  assert.match(file.headers.get('content-disposition'), /attachment/);
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), PNG);

  const patch = await fetch(`${base}/api/admin/orders/${id}`, { method: 'PATCH', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'in_progress', admin_note: 'Созвон в пятницу' }) });
  assert.equal(patch.status, 200);
  const updated = await patch.json();
  assert.equal(updated.status, 'in_progress');
  assert.equal(updated.history.length, 2);

  const badStatus = await fetch(`${base}/api/admin/orders/${id}`, { method: 'PATCH', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'hacked' }) });
  assert.equal(badStatus.status, 422);

  const stats = await (await get('/api/admin/stats')).json();
  assert.equal(stats.total, 1);
  assert.equal(stats.in_progress, 1);

  const csv = await (await get('/api/admin/export.csv')).text();
  assert.match(csv, new RegExp(createdNumber));

  const logout = await fetch(`${base}/api/admin/logout`, { method: 'POST', headers: { cookie } });
  assert.equal(logout.status, 200);
  assert.equal((await get('/api/admin/stats')).status, 401, 'session revoked on logout');
});
