import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker, { groupReports, mapFlights, matchOffers, cleanDest, looseJson, mapPlaces, cleanNotes, mapGeo, parseMapLink, mapTrain, mapWeather, tripKey, mapSpecial, sumEvents, placeName, coordsInPage } from '../src/worker.js';

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

test('twenty wrong editor passwords lock the editor area for the day, even for the right one', async () => {
  const env = { DB: fakeD1(), ADMIN_KEY: 'secret' };
  for (let i = 0; i < 20; i++) assert.equal((await call(env, 'GET', '/api/admin/queue', { admin: 'guess' + i })).status, 403);
  assert.equal((await call(env, 'GET', '/api/admin/queue', { admin: 'secret' })).status, 429);
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
  assert.equal((await (await call(env, 'GET', '/api/train?flat=32&flng=34&arrive=2030-01-01T08:00:00Z')).json()).available, false);
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

test('flight rows are mapped and bad rows dropped', () => {
  const f = mapFlights([{ price: 812.4, airline: 'LY', flight_number: 385, departure_at: '2026-11-15T06:10:00+02:00', transfers: 0, duration_to: 215, link: '/search/x' }, { price: 0 }, null]);
  assert.equal(f.length, 1); assert.deepEqual([f[0].price, f[0].dep, f[0].dur, f[0].transfers], [812, '06:10', 215, 0]);
  assert.equal(mapFlights([{ price: 1, departure_at: '2026-11-15T06:10', link: '/search/x?a=1' }], '583460')[0].link, 'https://www.aviasales.com/search/x?a=1&marker=583460&locale=he');
  assert.equal(mapFlights([{ price: 1, departure_at: '2026-11-15T06:10', link: '/s?marker=9' }], '583460')[0].link, 'https://www.aviasales.com/s?marker=9&locale=he');
});

test('the same outbound flight is listed once, at its cheapest price', () => {
  const row = (price) => ({ price, airline: 'W4', flight_number: 6044, departure_at: '2026-11-15T19:35:00+02:00' });
  const f = mapFlights([row(552), row(371), row(622), { ...row(900), flight_number: 1 }]);
  assert.deepEqual(f.map((x) => x.price), [371, 900]);
});

test('offers match attractions by name in either direction', () => {
  const m = matchOffers([{ storeName: 'המצפה התת ימי', label: '10% הנחה', cardName: 'חבר', actionUrl: 'https://x.test/a' }, { storeName: 'ACE', label: 'z' }], ['המצפה התת ימי אילת', 'טיילת וחוף']);
  assert.deepEqual(Object.keys(m), ['המצפה התת ימי אילת']); assert.equal(new URL(m['המצפה התת ימי אילת'][0].url).searchParams.get('store'), 'המצפה התת ימי');
});

test('a generated destination is validated before it is stored', () => {
  assert.equal(cleanDest({ error: true }), null);
  assert.equal(cleanDest({ n: 'x', hotel: { n: 'h', la: 999, lo: 1 }, at: [] }), null);
  const three = [1, 2, 3].map((i) => ({ n: 'a' + i, la: 25 + i / 100, lo: 55 }));
  const noHotel = cleanDest({ n: 'דובאי', at: three }, { code: 'DXB', la: 25.2, lo: 55.3 });
  assert.deepEqual([noHotel.code, noHotel.abroad, noHotel.hotel.la, noHotel.hotel.n], ['DXB', 1, 25.2, 'מלון משפחתי במרכז העיר']);
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

test('a model answer wrapped in prose or a code fence still parses', () => {
  assert.deepEqual(looseJson('Here you go:\n```json\n{"n":"x"}\n```'), { n: 'x' });
  assert.equal(looseJson('no json here'), null);
  assert.equal(looseJson('{"n":"cut off'), null);
});

test('a destination that fails once is retried, and the search key is the airport code', async () => {
  let runs = 0; const at = [1, 2, 3].map((i) => ({ n: 'a' + i, la: 25, lo: 55 }));
  const env = { DB: fakeD1(), AI: { run: async () => (++runs === 1 ? { response: '{"n":"cut' } : { response: JSON.stringify({ n: 'דובאי', at }) }) } };
  const r = await (await call(env, 'POST', '/api/dest', { device: dev(1), body: { q: 'דובאי', code: 'dxb', la: 25.2, lo: 55.3 } })).json();
  assert.equal(r.dest.code, 'DXB'); assert.equal(runs, 2);
  await call(env, 'POST', '/api/dest', { device: dev(2), body: { q: 'Dubai', code: 'DXB' } });
  assert.equal(runs, 2, 'second family gets the stored destination');
});

test('search results keep only cities with an airport code', () => {
  const p = mapPlaces([{ name: 'דובאי', code: 'DXB', country_name: 'איחוד האמירויות', coordinates: { lat: 25.2, lon: 55.3 } }, { name: 'x' }, { name: 'y', code: 'toolong' }]);
  assert.deepEqual(p, [{ name: 'דובאי', code: 'DXB', country: 'איחוד האמירויות', la: 25.2, lo: 55.3 }]);
});

test('a destination asked for as Israeli is stored as domestic, whatever the model says', async () => {
  const at = [1, 2, 3].map((i) => ({ n: 'a' + i, la: 30.6, lo: 34.8 }));
  const env = { DB: fakeD1(), AI: { run: async () => ({ response: JSON.stringify({ n: 'מצפה רמון', code: 'TLV', abroad: true, at }) }) } };
  const r = await (await call(env, 'POST', '/api/dest', { device: dev(1), body: { q: 'מצפה רמון', il: true } })).json();
  assert.deepEqual([r.dest.abroad, r.dest.code], [0, '']);
});

test('notes keep only the places that were asked about, and a warning needs a reason', () => {
  const out = cleanNotes({ notes: [{ n: 'A', note: 'סגור בחורף', warn: true }, { n: 'B', note: '', warn: true }, { n: 'Z', note: 'x' }] }, ['A', 'B', 'C']);
  assert.deepEqual(out, [{ n: 'A', note: 'סגור בחורף', warn: true }, { n: 'B', note: '', warn: false }, { n: 'C', note: '', warn: false }]);
});
test('map lookup reads both providers, and a Google Maps link gives the pin', () => {
  assert.deepEqual(mapGeo([]), []);
  assert.equal(mapGeo([{ lat: '41.9', lon: '12.49', display_name: 'Hotel' }])[0].la, 41.9);
  assert.equal(mapGeo({ features: [{ geometry: { coordinates: [12.49, 41.9] }, properties: { name: 'H' } }] }, 'photon')[0].lo, 12.49);
  assert.deepEqual(parseMapLink('https://www.google.com/maps/place/X/@47.49,19.05,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d47.4983!4d19.0571'), { la: 47.4983, lo: 19.0571 });
  assert.deepEqual(parseMapLink('https://www.google.com/maps/@47.49,19.05,17z'), { la: 47.49, lo: 19.05 });
  assert.equal(parseMapLink('https://www.google.com/maps/place/X'), null);
});

test('the train answer is the first and last rail step, in Israel time', () => {
  const st = (dep, arr, type, a, b) => ({ transitDetails: { stopDetails: { departureTime: dep, arrivalTime: arr, departureStop: { name: a }, arrivalStop: { name: b } }, transitLine: { vehicle: { type } } } });
  const j = { routes: [{ legs: [{ steps: [{}, st('2026-11-15T04:10:00Z', '2026-11-15T04:30:00Z', 'BUS', 'x', 'y'), st('2026-11-15T05:00:00Z', '2026-11-15T05:40:00Z', 'HEAVY_RAIL', 'חיפה', 'תל אביב'), st('2026-11-15T05:50:00Z', '2026-11-15T06:05:00Z', 'HEAVY_RAIL', 'תל אביב', 'נתב״ג')] }] }] };
  const t = mapTrain(j);
  assert.equal(t.dep, 7 * 60); assert.equal(t.arr, 8 * 60 + 5); assert.equal(t.from, 'חיפה'); assert.equal(t.changes, 1); assert.equal(t.bus, true);
  assert.equal(mapTrain({ routes: [{ legs: [{ steps: [st('2026-11-15T04:10:00Z', '2026-11-15T04:30:00Z', 'BUS', 'x', 'y')] }] }] }), null);
});
test('weather keeps one entry per day and marks the kind', () => {
  const w = mapWeather({ daily: { time: ['a', 'b'], temperature_2m_max: [24.6, 20], temperature_2m_min: [15.2, null], precipitation_probability_max: [70, 10], precipitation_sum: [3.2, 0] } }, 'forecast');
  assert.deepEqual(w.days[0], { hi: 25, lo: 15, rain: 70, mm: 3 }); assert.equal(w.days[1].lo, null);
  assert.equal(mapWeather({ daily: { time: ['a'], temperature_2m_max: [1], temperature_2m_min: [0], precipitation_sum: [0] } }, 'lastyear').days[0].rain, null);
});
test('a shared trip key replaces the device only when it is long enough', () => {
  const rq = (h) => new Request('https://x/api/trip', { headers: h });
  const dev = '11111111-1111-4111-8111-111111111111';
  assert.equal(tripKey(rq({ 'x-device': dev })), dev);
  assert.equal(tripKey(rq({ 'x-device': dev, 'x-trip': 'short' })), dev);
  assert.equal(tripKey(rq({ 'x-device': dev, 'x-trip': 'abcdefghijklmnopqrstuvwxyz012345' })), 't:abcdefghijklmnopqrstuvwxyz012345');
  assert.equal(tripKey(rq({ 'x-trip': 'abcdefghijklmnopqrstuvwxyz012345' })), '');
});

test('club benefits join the offers, matched by alias and marked while unverified', () => {
  const sp = mapSpecial([{ merchant: 'חמת גדר', aliases: ['Hamat Gader'], cardName: 'קרנות השוטרים', benefitType: 'special_price', purchasePrice: 66, verificationStatus: 'needs_verification', sourceUrl: 'https://club.example/x' },
    { merchant: 'AVIS', provider: 'דיסקונט', benefitType: 'charge_discount', benefitValue: 5, verificationStatus: 'verified' }, { merchant: 'x', benefitType: 'other', conditions: '' }]);
  assert.equal(sp.length, 2);
  const m = matchOffers(sp, ['חמת גדר', 'Hamat Gader', 'AVIS']);
  assert.equal(m['חמת גדר'][0].label, 'מחיר מיוחד ₪66'); assert.equal(m['חמת גדר'][0].pending, true); assert.equal(new URL(m['חמת גדר'][0].url).searchParams.get('source'), 'https://club.example/x');
  assert.equal(m['Hamat Gader'].length, 1); assert.equal(m.AVIS[0].label, '5% הנחה'); assert.equal(m.AVIS[0].pending, undefined);
});

test('offers include special benefits with honest verification status and a direct detail link', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => new Response(JSON.stringify(String(url).includes('special-benefits') ? {
    benefits: [{ merchant: 'חמת גדר', cardId: 'kranot-hashoter', cardName: 'קרנות השוטרים', benefitType: 'special_price', purchasePrice: null, faceValue: null, benefitValue: null, verificationStatus: 'needs_verification', conditions: 'מחיר מיוחד במועדון', sourceUrl: 'https://official.example/deal' }],
  } : { offers: [{ storeName: 'AVIS', cardId: 'isracard', cardName: 'ישראכרט', label: '13% הנחה' }] }), { headers: { 'content-type': 'application/json' } });
  try {
    const env = { DB: fakeD1() };
    const response = await call(env, 'GET', '/api/offers?names=' + encodeURIComponent('AVIS|חמת גדר'));
    const { offers } = await response.json();
    assert.equal(offers['חמת גדר'][0].pending, true);
    const direct = new URL(offers['חמת גדר'][0].url);
    assert.equal(direct.searchParams.get('store'), 'חמת גדר');
    assert.equal(direct.searchParams.get('card'), 'police');
    assert.equal(direct.searchParams.get('source'), 'https://official.example/deal');
    const regular = new URL(offers.AVIS[0].url);
    assert.equal(regular.searchParams.get('card'), 'isracard');
    assert.equal(regular.searchParams.get('offer'), '13% הנחה');
  } finally { globalThis.fetch = originalFetch; }
});


test('usage events are counted per day and only known names are accepted', async () => {
  const env = { DB: fakeD1() };
  assert.equal((await call(env, 'POST', '/api/ev', { body: { e: 'open' } })).status, 200);
  assert.equal((await call(env, 'POST', '/api/ev', { body: { e: 'open' } })).status, 200);
  assert.equal((await call(env, 'POST', '/api/ev', { body: { e: 'drop table' } })).status, 400);
  const now = Date.parse('2026-10-11T12:00:00Z');
  const s = sumEvents([{ k: 'ev:2026-10-11:open', n: 2 }, { k: 'ev:2026-10-06:open', n: 3 }, { k: 'ev:2026-09-01:open', n: 9 }, { k: 'ev:2026-10-11:start', n: 1 }, { k: 'google:2026-10', n: 5 }], 7, now);
  assert.deepEqual(s, { open: 5, start: 1 });
});

test('a share link without a point still gives the place name, and the page can give the point', () => {
  assert.equal(placeName('https://www.google.com/maps/place/Shuk+Restaurant,+Ermou+120,+Athina+105+54/data=!4m2!3m1!1s0x14a1bd:0x1?utm_source=mapsmobile'), 'Shuk Restaurant, Ermou 120, Athina 105 54');
  assert.equal(placeName('https://www.google.com/maps/@37.9,23.7,15z'), '');
  assert.equal(placeName('https://www.google.com/maps/place/Shuk%2BRestaurant/data=!4m2'), 'Shuk Restaurant');
  assert.deepEqual(coordsInPage('<meta content="https://maps.google.com/maps/api/staticmap?center=37.9781%2C23.7214&zoom=17">'), { la: 37.9781, lo: 23.7214 });
  assert.equal(coordsInPage('<html>nothing</html>'), null);
});

test('a shared view of a trip is stored under a new id and read back by anyone', async () => {
  const env = { DB: fakeD1() }, dev = '11111111-1111-4111-8111-111111111111';
  const r = await (await call(env, 'POST', '/api/share', { device: dev, body: { dest: { n: 'רומא', at: [] }, nights: 3 } })).json();
  assert.match(r.id, /^[a-z0-9]{10}$/);
  assert.equal((await (await call(env, 'GET', '/api/share?id=' + r.id)).json()).trip.nights, 3);
  assert.equal((await call(env, 'GET', '/api/share?id=aaaaaaaaaa')).status, 404);
  assert.equal((await call(env, 'POST', '/api/share', { device: dev, body: { nights: 3 } })).status, 400);
});
