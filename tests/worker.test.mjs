import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker, { groupReports, mapFlights, matchOffers, cleanDest } from '../src/worker.js';

function fakeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8'));
  const stmt = (sql, args) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => db.prepare(sql).run(...args),
  });
  return { prepare: (sql) => stmt(sql, []), raw: db };
}
const dev = (n) => `0000000${n}-0000-4000-8000-000000000000`;
const call = (env, method, path, { device, body, admin } = {}) => {
  const headers = {}; if (device) headers['x-device'] = device; if (admin) headers['x-admin'] = admin;
  return worker.fetch(new Request('https://go.test' + path, { method, headers, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) }), env);
};
const report = (env, device, text, extra = {}) => call(env, 'POST', '/api/reports', { device, body: { dest: 'רומא', place: 'הקולוסיאום', kind: 'warn', text, ...extra } });

test('trip state is saved per device and refuses a missing device id', async () => {
  const env = { DB: fakeD1() };
  assert.equal((await call(env, 'GET', '/api/trip')).status, 400);
  assert.equal((await call(env, 'PUT', '/api/trip', { device: dev(1), body: { dest: 'rome' } })).status, 200);
  assert.equal(JSON.parse((await (await call(env, 'GET', '/api/trip', { device: dev(1) })).json()).state).dest, 'rome');
  assert.equal((await (await call(env, 'GET', '/api/trip', { device: dev(2) })).json()).state, null);
  assert.equal((await call(env, 'PUT', '/api/trip', { device: dev(1), body: 'x'.repeat(70000) })).status, 413);
});

test('a tip is public only after two families report it; the reporter sees their own', async () => {
  const env = { DB: fakeD1() };
  assert.equal((await report(env, dev(1), 'תור של שעה')).status, 200);
  const q = '/api/reports?dest=' + encodeURIComponent('רומא');
  assert.equal((await (await call(env, 'GET', q, { device: dev(3) })).json()).groups.length, 0);
  const mine = (await (await call(env, 'GET', q, { device: dev(1) })).json()).groups;
  assert.equal(mine.length, 1); assert.equal(mine[0].ver, false); assert.equal(mine[0].mine, true);
  await report(env, dev(2), 'תור ארוך מאוד');
  const all = (await (await call(env, 'GET', q, { device: dev(3) })).json()).groups;
  assert.equal(all.length, 1); assert.equal(all[0].cnt, 2); assert.equal(all[0].ver, true);
});

test('the same family reporting the same topic twice counts once', async () => {
  const env = { DB: fakeD1() };
  await report(env, dev(1), 'תור'); await report(env, dev(1), 'תור שוב');
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS c FROM reports').get().c, 1);
});

test('a family is limited to five reports a day', async () => {
  const env = { DB: fakeD1() };
  for (let i = 0; i < 5; i++) assert.equal((await report(env, dev(1), 'טיפ ' + i, { place: 'מקום ' + i })).status, 200);
  assert.equal((await report(env, dev(1), 'עוד אחד', { place: 'מקום 9' })).status, 429);
});

test('feedback the model marks as useless is not stored', async () => {
  const env = { DB: fakeD1(), AI: { run: async () => ({ response: '{"skip":true}' }) } };
  assert.equal((await report(env, dev(1), 'היה כיף')).status, 422);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS c FROM reports').get().c, 0);
});

test('the editor queue needs the admin key, and approval publishes a single report', async () => {
  const env = { DB: fakeD1(), ADMIN_KEY: 'secret' };
  await report(env, dev(1), 'תור של שעה');
  assert.equal((await call(env, 'GET', '/api/admin/queue', { admin: 'wrong' })).status, 403);
  assert.equal((await call(env, 'GET', '/api/admin/queue')).status, 403);
  const { queue } = await (await call(env, 'GET', '/api/admin/queue', { admin: 'secret' })).json();
  assert.equal(queue.length, 1);
  assert.equal((await call(env, 'POST', '/api/admin/approve', { body: { ids: queue[0].ids, status: 'yes' } })).status, 403);
  await call(env, 'POST', '/api/admin/approve', { admin: 'secret', body: { ids: queue[0].ids, status: 'yes' } });
  const g = (await (await call(env, 'GET', '/api/reports?dest=' + encodeURIComponent('רומא'), { device: dev(9) })).json()).groups;
  assert.equal(g.length, 1); assert.equal(g[0].ok, true);
});

test('rejected and year-old reports are dropped', () => {
  const now = Date.now(), row = (o) => ({ place: 'p', kind: 'tip', topic: 't', device: 'a', status: '', ts: now, text: 'x', ...o });
  assert.equal(groupReports([row({ status: 'no' })], 'a', now).length, 0);
  assert.equal(groupReports([row({ ts: now - 366 * 864e5 })], 'a', now).length, 0);
});

test('without provider keys the data endpoints say unavailable instead of failing', async () => {
  const env = { DB: fakeD1() };
  assert.deepEqual(await (await call(env, 'GET', '/api/flights?dest=FCO&date=2026-11-15')).json(), { available: false, reason: 'no_key' });
  assert.equal((await (await call(env, 'GET', '/api/route?flat=32&flng=34&tlat=32.1&tlng=34.9')).json()).available, false);
  assert.equal((await (await call(env, 'GET', '/api/train?from=tlv&by=300&dow=0')).json()).available, false);
  assert.equal((await call(env, 'GET', '/api/flights?dest=xx&date=bad')).status, 400);
});

test('route lookups stop at the monthly cap and never call Google past it', async () => {
  const env = { DB: fakeD1(), GOOGLE_KEY: 'k', GOOGLE_MONTHLY_CAP: '2' };
  let calls = 0; const real = globalThis.fetch;
  globalThis.fetch = async () => { calls++; return new Response(JSON.stringify({ routes: [{ duration: '1500s', distanceMeters: 21000 }] })); };
  try {
    const go = (lat) => call(env, 'GET', `/api/route?flat=${lat}&flng=34&tlat=32.5&tlng=34.9`).then((r) => r.json());
    assert.deepEqual((({ available, minutes, km }) => ({ available, minutes, km }))(await go(32.1)), { available: true, minutes: 25, km: 21 });
    await go(32.1); assert.equal(calls, 1, 'second identical lookup is served from cache');
    await go(32.2); assert.equal((await go(32.3)).reason, 'cap'); assert.equal(calls, 2);
  } finally { globalThis.fetch = real; }
});

test('train answers once the timetable table has rows', async () => {
  const env = { DB: fakeD1() };
  env.DB.raw.exec("INSERT INTO rail VALUES ('tlv',150,168,'0123456'),('tlv',180,198,'0123456'),('tlv',200,218,'6')");
  assert.deepEqual(await (await call(env, 'GET', '/api/train?from=tlv&by=199&dow=1')).json(), { available: true, dep: 180, arr: 198 });
});

test('flight rows are mapped and bad rows dropped', () => {
  const f = mapFlights([{ price: 812.4, airline: 'LY', flight_number: 385, departure_at: '2026-11-15T06:10:00+02:00', transfers: 0, duration_to: 215, link: '/search/x' }, { price: 0 }, null]);
  assert.equal(f.length, 1); assert.deepEqual([f[0].price, f[0].dep, f[0].dur, f[0].transfers], [812, '06:10', 215, 0]);
});

test('offers match attractions by name in either direction', () => {
  const m = matchOffers([{ storeName: 'המצפה התת ימי', label: '10% הנחה', cardName: 'חבר', actionUrl: 'https://x.test/a' }, { storeName: 'ACE', label: 'z' }], ['המצפה התת ימי אילת', 'טיילת וחוף']);
  assert.deepEqual(Object.keys(m), ['המצפה התת ימי אילת']); assert.equal(m['המצפה התת ימי אילת'][0].url, 'https://x.test/a');
});

test('a generated destination is validated before it is stored', () => {
  assert.equal(cleanDest({ error: true }), null);
  assert.equal(cleanDest({ n: 'x', hotel: { n: 'h', la: 999, lo: 1 }, at: [] }), null);
  const at = [1, 2, 3].map((i) => ({ n: 'a' + i, la: 41 + i / 100, lo: 2, who: 'weird', min: '4', a: 10, c: 5, rec: 'r' }));
  const d = cleanDest({ n: 'ברצלונה', en: 'Barcelona', code: 'bcn', abroad: true, hotel: { n: 'h', la: 41.4, lo: 2.1, p: 600 }, at });
  assert.equal(d.code, 'BCN'); assert.equal(d.at[0].who, 'all'); assert.equal(d.at[0].min, 4);
});

test('a built destination is cached, so the model runs once for everyone', async () => {
  let runs = 0; const at = [1, 2, 3].map((i) => ({ n: 'a' + i, la: 41, lo: 2 }));
  const env = { DB: fakeD1(), AI: { run: async () => { runs++; return { response: JSON.stringify({ n: 'ברצלונה', hotel: { n: 'h', la: 41, lo: 2 }, at }) }; } } };
  await call(env, 'POST', '/api/dest', { device: dev(1), body: { q: 'Barcelona' } });
  const r = await (await call(env, 'POST', '/api/dest', { device: dev(2), body: { q: 'barcelona' } })).json();
  assert.equal(r.dest.n, 'ברצלונה'); assert.equal(runs, 1);
});
