import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/worker.js';
import { tripSummary, summaryCors } from '../src/account.js';

function fakeD1() {
  const db = new DatabaseSync(':memory:');
  for (const f of readdirSync(new URL('../migrations/', import.meta.url)).sort()) db.exec(readFileSync(new URL('../migrations/' + f, import.meta.url), 'utf8'));
  const stmt = (sql, args) => ({ bind: (...a) => stmt(sql, a), first: async () => db.prepare(sql).get(...args) ?? null, all: async () => ({ results: db.prepare(sql).all(...args) }), run: async () => db.prepare(sql).run(...args) });
  return { prepare: (sql) => stmt(sql, []), raw: db };
}
const GO = 'https://go.test', DEV = '11111111-2222-4333-8444-555555555555', DEV2 = '99999999-2222-4333-8444-555555555555';
const pass = (user) => ({ async fetch(url, init) { const ok = user && String(init.headers.cookie).includes('hp_session=good'); return new Response(JSON.stringify(ok ? { signedIn: true, user } : { signedIn: false })); } });
const call = (env, method, path, { dev = DEV, cookie, origin } = {}) => {
  const h = { 'x-device': dev }; if (cookie) h.cookie = cookie; if (origin) h.origin = origin; if (method !== 'GET') h['content-type'] = 'application/json';
  return worker.fetch(new Request(GO + path, { method, headers: h, body: method === 'GET' ? undefined : (path === '/api/trip' ? undefined : '{}') }), env);
};
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const putTrip = (env, dev, state) => worker.fetch(new Request(GO + '/api/trip', { method: 'PUT', headers: { 'x-device': dev, 'content-type': 'application/json' }, body: JSON.stringify(state) }), env);

test('without Hania Pass the account feature is off', async () => {
  assert.deepEqual(await (await call({ DB: fakeD1() }, 'GET', '/api/account')).json(), { available: false });
});

test('save the trip in the account; Hania Today gets destination and countdown, never the key', async () => {
  const env = { DB: fakeD1(), PASS: pass({ id: 'u1', email: 'l@example.com' }) }, cookie = 'hp_session=good';
  await putTrip(env, DEV, { dest: 'rome', date: day(23), nights: 7, fam: [{ a: 38 }, { a: 36 }, { a: 8 }, { a: 4 }] });
  assert.equal((await call(env, 'POST', '/api/account/link', { cookie, origin: GO })).status, 200);
  assert.equal((await (await call(env, 'GET', '/api/account', { cookie })).json()).linked, true);
  const res = await call(env, 'GET', '/api/account/summary', { cookie, origin: 'https://pass.hania360.com', dev: DEV2 });
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://pass.hania360.com');
  const body = await res.json();
  assert.deepEqual(body.trips, [{ dest: 'רומא', date: day(23), nights: 7, people: 4, daysTo: 23 }]);
  assert.ok(!JSON.stringify(body).includes(DEV));
  assert.equal((await call(env, 'POST', '/api/account/unlink', { cookie, origin: GO })).status, 200);
  assert.deepEqual((await (await call(env, 'GET', '/api/account/summary', { cookie })).json()).trips, []);
});

test('changes need HaniaGo\'s own page and a signed-in person', async () => {
  const env = { DB: fakeD1(), PASS: pass({ id: 'u1', email: 'l@example.com' }) };
  assert.equal((await call(env, 'POST', '/api/account/link', { cookie: 'hp_session=good', origin: 'https://evil.example' })).status, 403);
  assert.equal((await call(env, 'POST', '/api/account/link', { cookie: 'hp_session=bad', origin: GO })).status, 401);
  assert.equal(summaryCors('https://evil.example'), null);
});

test('tripSummary: custom destinations, ongoing trips count, finished ones do not', () => {
  const now = Date.parse('2026-10-14T09:00:00Z');
  assert.equal(tripSummary(JSON.stringify({ dest: 'c_1', custom: { c_1: { n: 'ליסבון' } }, date: '2026-10-20', nights: 5, fam: [] }), now).dest, 'ליסבון');
  assert.equal(tripSummary(JSON.stringify({ dest: 'eilat', date: '2026-10-12', nights: 4, fam: [] }), now).daysTo, -2);
  assert.equal(tripSummary(JSON.stringify({ dest: 'eilat', date: '2026-10-01', nights: 4, fam: [] }), now), null);
  assert.equal(tripSummary('not json', now), null);
  assert.equal(tripSummary(JSON.stringify({ dest: 'nowhere', date: '2026-10-20' }), now), null);
});
