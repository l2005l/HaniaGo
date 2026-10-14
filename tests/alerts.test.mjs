import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/worker.js';
import { cheapest, runAlerts, createAlert, COST } from '../src/alerts.js';

function fakeD1() {
  const db = new DatabaseSync(':memory:');
  for (const f of readdirSync(new URL('../migrations/', import.meta.url)).sort()) db.exec(readFileSync(new URL('../migrations/' + f, import.meta.url), 'utf8'));
  const stmt = (sql, args) => ({ bind: (...a) => stmt(sql, a), first: async () => db.prepare(sql).get(...args) ?? null, all: async () => ({ results: db.prepare(sql).all(...args) }), run: async () => db.prepare(sql).run(...args) });
  return { prepare: (sql) => stmt(sql, []), raw: db };
}
const GO = 'https://go.test', DEV = '11111111-2222-4333-8444-555555555555', DEV2 = '99999999-2222-4333-8444-555555555555';
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const EP = 'https://fcm.googleapis.com/fcm/send/abc';

// Hania Pass: who is signed in, and a points wallet that can be spent once per key.
function fakePass(balance = 100) {
  const spent = new Set();
  return {
    spent,
    async fetch(url, init) {
      const ok = String(init.headers.cookie).includes('hp_session=good');
      if (url.endsWith('/api/session')) return new Response(JSON.stringify(ok ? { signedIn: true, user: { id: 'u1', email: 'l@example.com' } } : { signedIn: false }));
      if (!ok) return new Response(JSON.stringify({ error: 'signed_out' }), { status: 401 });
      const b = JSON.parse(init.body);
      if (!spent.has(b.key)) { if (balance < b.points) return new Response(JSON.stringify({ error: 'not_enough', balance }), { status: 402 }); balance -= b.points; spent.add(b.key); }
      return new Response(JSON.stringify({ ok: true, balance }));
    },
  };
}
const post = (env, path, body, { dev = DEV, cookie, origin = GO } = {}) => worker.fetch(new Request(GO + path, { method: 'POST', headers: { 'x-device': dev, 'content-type': 'application/json', origin, ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) }), env);
const get = (env, path, { dev = DEV, cookie } = {}) => worker.fetch(new Request(GO + path, { headers: { 'x-device': dev, ...(cookie ? { cookie } : {}) } }), env);
const prices = (list) => async () => new Response(JSON.stringify({ success: true, data: list }));
const rome = (date = day(40), extra = {}) => ({ code: 'FCO', name: 'רומא', date, ret: '', target: 900, ...extra });

test('cheapest: exact dates, or any day that month with about the same length', () => {
  const data = [
    { price: 1200, departure_at: '2026-12-10T08:00:00+02:00', return_at: '2026-12-17T10:00:00+01:00', link: '/a' },
    { price: 800, departure_at: '2026-12-20T08:00:00+02:00', return_at: '2026-12-27T10:00:00+01:00', link: '/b' },
    { price: 500, departure_at: '2026-12-21T08:00:00+02:00', return_at: '2026-12-23T10:00:00+01:00', link: '/c' },
    { price: 300, departure_at: '2027-01-02T08:00:00+02:00', return_at: '2027-01-09T10:00:00+01:00', link: '/d' },
  ];
  assert.equal(cheapest(data, { date: '2026-12-10', ret: '2026-12-17', flex: false }).price, 1200);
  const flex = cheapest(data, { date: '2026-12-10', ret: '2026-12-17', flex: true }, '583460');
  assert.deepEqual([flex.price, flex.date], [800, '2026-12-20'], 'a 2-night trip and next month do not count');
  assert.equal(flex.link, 'https://www.aviasales.com/b?marker=583460');
  assert.equal(cheapest([], { date: '2026-12-10', flex: false }), null);
});

test('the first alert is free; checks the price right away; only from HaniaGo itself', async () => {
  const env = { DB: fakeD1(), TRAVELPAYOUTS_TOKEN: 't' };
  const req = (body, origin = GO) => new Request(GO + '/api/alerts', { method: 'POST', headers: { 'x-device': DEV, 'content-type': 'application/json', origin }, body: JSON.stringify(body) });
  assert.equal((await createAlert(req(rome(), 'https://evil.example'), env)).status, 403);
  assert.equal((await createAlert(req(rome(day(-1))), env)).status, 400, 'a date in the past');
  assert.equal((await createAlert(req(rome(day(40), { target: 5 })), env)).status, 400);
  const made = await (await createAlert(req({ ...rome(), endpoint: EP }), env, prices([{ price: 1100, departure_at: day(40) + 'T08:00:00Z', link: '/x' }]))).json();
  assert.equal(made.paid, 0);
  assert.deepEqual([made.alert.start, made.alert.best, made.alert.hit], [1100, 1100, false]);
  assert.equal((await post(env, '/api/alerts', rome())).status, 409, 'the same alert twice');
  const second = await post(env, '/api/alerts', rome(day(60)));
  assert.equal(second.status, 402, 'a second alert without an account');
  const list = await (await get(env, '/api/alerts')).json();
  assert.equal(list.alerts.length, 1);
  assert.equal((await (await get(env, '/api/alerts', { dev: DEV2 })).json()).alerts.length, 0, 'another phone sees nothing');
});

test('more alerts cost Hania points, paid once, refused when there are not enough', async () => {
  const PASS = fakePass(COST + 10), env = { DB: fakeD1(), PASS };
  const cookie = 'hp_session=good';
  assert.equal((await post(env, '/api/alerts', rome(day(30)), { cookie })).status, 200);
  const two = await (await post(env, '/api/alerts', rome(day(31)), { cookie })).json();
  assert.deepEqual([two.paid, two.balance], [COST, 10]);
  const three = await post(env, '/api/alerts', rome(day(32)), { cookie });
  assert.equal(three.status, 402);
  assert.equal((await three.json()).error, 'not_enough');
  assert.equal(PASS.spent.size, 1);
  // A phone that made an alert before signing in: it joins the account.
  await post(env, '/api/alerts', rome(day(50)), { dev: DEV2 });
  await get(env, '/api/alerts', { dev: DEV2, cookie });
  const summary = await (await get(env, '/api/account/summary', { cookie })).json();
  assert.equal(summary.alerts.length, 3);
});

test('the hourly check tells the phone once when the price reaches the target, then only for a clear new low', async () => {
  const DB = fakeD1(), env = { DB, TRAVELPAYOUTS_TOKEN: 't' };
  await createAlert(new Request(GO + '/api/alerts', { method: 'POST', headers: { 'x-device': DEV, 'content-type': 'application/json', origin: GO }, body: JSON.stringify({ ...rome(), endpoint: EP }) }), env, prices([]));
  const woke = [];
  const net = (price) => async (url, init) => {
    if (String(url).startsWith(EP)) { woke.push(price); return new Response(null, { status: 201 }); }
    return new Response(JSON.stringify({ success: true, data: [{ price, departure_at: day(40) + 'T08:00:00Z', link: '/x' }] }));
  };
  const realFetch = globalThis.fetch;
  try {
    let t = Date.now() + 7 * 3600e3;
    globalThis.fetch = net(950); assert.deepEqual(await runAlerts(env, t, net(950)), { checked: 1, sent: 0 });
    t += 7 * 3600e3; globalThis.fetch = net(880); assert.deepEqual(await runAlerts(env, t, net(880)), { checked: 1, sent: 1 });
    const msg = await (await worker.fetch(new Request(GO + '/api/push/msg', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: EP }) }), env)).json();
    assert.match(msg.title, /רומא ב־₪880/);
    assert.equal(msg.url, '/#flight');
    t += 7 * 3600e3; globalThis.fetch = net(870); assert.equal((await runAlerts(env, t, net(870))).sent, 0, '₪10 lower is not news');
    t += 7 * 3600e3; globalThis.fetch = net(800); assert.equal((await runAlerts(env, t, net(800))).sent, 1);
    assert.equal((await runAlerts(env, t + 3600e3, net(700))).checked, 0, 'not checked again within 6 hours');
  } finally { globalThis.fetch = realFetch; }
  assert.deepEqual(woke, [880, 800]);
});
