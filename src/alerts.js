// Flight price alerts. A person picks a destination and dates, and a price per traveller;
// HaniaGo checks the cached Travelpayouts prices a few times a day and sends a push
// (and, with a Hania360 account, a line in Hania Today) when the price drops to it.
//
// The first alert is free. More alerts (up to MAX) need a Hania360 account and cost
// Hania points, which Hania Pass deducts (Service Binding env.PASS) with the person's own cookie.

import { passUser } from './account.js';
import { okEndpoint, wake, subId } from './push.js';

export const FREE = 1, MAX = 5, COST = 50, CHECK_EVERY = 6 * 3600e3, PER_RUN = 40;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const bad = (error, status = 400) => json({ error }, status);
const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
const sameOrigin = (req) => req.headers.get('origin') === new URL(req.url).origin;
const deviceOf = (req) => { const d = req.headers.get('x-device') || ''; return /^[a-f0-9-]{36}$/.test(d) ? d : null; };
const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const dayMs = (s) => Date.parse(s + 'T12:00:00Z');
const isoDay = (t) => new Date(t).toISOString().slice(0, 10);

/** The cheapest matching round trip from Travelpayouts data, or null. Flexible = any day that month, same length ±2 nights. */
export function cheapest(data, a, marker = '') {
  const nights = a.ret ? Math.round((dayMs(a.ret) - dayMs(a.date)) / 864e5) : 0;
  let best = null;
  for (const f of Array.isArray(data) ? data : []) {
    if (!f || !(f.price > 0) || !f.departure_at) continue;
    const dep = String(f.departure_at).slice(0, 10), ret = String(f.return_at || '').slice(0, 10);
    if (a.flex) {
      if (dep.slice(0, 7) !== a.date.slice(0, 7)) continue;
      if (a.ret && (!isDay(ret) || Math.abs(Math.round((dayMs(ret) - dayMs(dep)) / 864e5) - nights) > 2)) continue;
    } else if (dep !== a.date || (a.ret && ret && ret !== a.ret)) continue;
    if (!best || f.price < best.price) best = { price: Math.round(f.price), date: dep, ret, link: f.link ? 'https://www.aviasales.com' + f.link + (marker ? (f.link.includes('?') ? '&' : '?') + 'marker=' + marker : '') : '' };
  }
  return best;
}

async function lookup(env, a, fetchImpl = fetch) {
  if (!env.TRAVELPAYOUTS_TOKEN) return null;
  const q = new URLSearchParams({ origin: 'TLV', destination: a.code, departure_at: a.flex ? a.date.slice(0, 7) : a.date, currency: 'ils', sorting: 'price', direct: String(!!a.direct), limit: a.flex ? '200' : '30', one_way: a.ret ? 'false' : 'true', token: env.TRAVELPAYOUTS_TOKEN });
  if (a.ret && !a.flex) q.set('return_at', a.ret);
  try {
    const r = await fetchImpl('https://api.travelpayouts.com/aviasales/v3/prices_for_dates?' + q, { headers: { 'accept-encoding': 'gzip, deflate' } });
    const j = await r.json();
    return r.ok && j.success ? cheapest(j.data, a, env.TP_MARKER) : null;
  } catch { return null; }
}

const view = (r) => ({ id: r.id, code: r.code, name: r.name, date: r.date, ret: r.ret, flex: !!r.flex, direct: !!r.direct, target: r.target,
  start: r.start_price || null, best: r.best_price || null, bestDate: r.best_date || '', link: r.best_link || '', checked: r.checked || 0, hit: !!r.best_price && r.best_price <= r.target });

async function mine(env, device, userId) {
  const rows = (await env.DB.prepare('SELECT * FROM price_alerts WHERE device=? OR (?<>\'\' AND user_id=?) ORDER BY created').bind(device, userId || '', userId || '').all()).results || [];
  return rows;
}

export async function listAlerts(req, env) {
  const device = deviceOf(req); if (!device) return bad('device');
  const user = await passUser(req, env);
  // Alerts made on this phone before signing in now belong to the account too (Hania Today shows them).
  if (user) await env.DB.prepare("UPDATE price_alerts SET user_id=? WHERE device=? AND user_id=''").bind(user.id, device).run();
  const rows = await mine(env, device, user && user.id);
  return json({ alerts: rows.map(view), free: FREE, max: MAX, cost: COST, signedIn: !!user, account: user !== undefined });
}

/** Spends Hania points through Hania Pass, once per key. */
async function spend(req, env, key, label) {
  try {
    const r = await env.PASS.fetch('https://pass.internal/api/points/spend', { method: 'POST', headers: { cookie: req.headers.get('cookie') || '', 'content-type': 'application/json' }, body: JSON.stringify({ key, points: COST, label }) });
    const j = await r.json().catch(() => ({}));
    return r.ok ? { ok: true, balance: j.balance } : { ok: false, error: j.error || 'points', balance: j.balance };
  } catch { return { ok: false, error: 'points' }; }
}

export async function createAlert(req, env, fetchImpl = fetch) {
  if (!sameOrigin(req)) return bad('origin', 403);
  const device = deviceOf(req); if (!device) return bad('device');
  const b = await req.json().catch(() => null) || {};
  const a = { code: str(b.code, 3).toUpperCase(), name: str(b.name, 60), date: str(b.date, 10), ret: str(b.ret, 10), flex: !!b.flex, direct: !!b.direct, target: Math.round(+b.target) };
  const now = Date.now();
  if (!/^[A-Z]{3}$/.test(a.code) || !a.name || !isDay(a.date) || (a.ret && (!isDay(a.ret) || a.ret <= a.date))) return bad('params');
  if (dayMs(a.date) < now || dayMs(a.date) > now + 330 * 864e5) return bad('date');
  if (!(a.target >= 50 && a.target <= 50000)) return bad('target');
  const endpoint = okEndpoint(b.endpoint) ? b.endpoint : '';
  const user = await passUser(req, env);
  const rows = await mine(env, device, user && user.id);
  if (rows.some((r) => r.code === a.code && r.date === a.date && r.ret === a.ret && !!r.flex === a.flex)) return bad('exists', 409);
  if (rows.length >= MAX) return bad('too_many', 409);
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  let paid = 0, balance;
  if (rows.length >= FREE) {
    if (!user) return json({ error: user === undefined ? 'too_many' : 'need_account', cost: COST }, 402);
    const s = await spend(req, env, 'spend:go_alert:' + id, `התראת מחיר: ${a.name}`);
    if (!s.ok) return json({ error: s.error === 'not_enough' ? 'not_enough' : 'points', cost: COST, balance: s.balance }, 402);
    paid = COST; balance = s.balance;
  }
  const best = await lookup(env, a, fetchImpl);
  await env.DB.prepare('INSERT INTO price_alerts (id,device,user_id,endpoint,code,name,date,ret,flex,direct,target,start_price,best_price,best_date,best_link,notified_price,checked,paid,created) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id, device, user ? user.id : '', endpoint, a.code, a.name, a.date, a.ret, a.flex ? 1 : 0, a.direct ? 1 : 0, a.target, best ? best.price : 0, best ? best.price : 0, best ? best.date : '', best ? best.link : '', 0, now, paid, now).run();
  const row = await env.DB.prepare('SELECT * FROM price_alerts WHERE id=?').bind(id).first();
  return json({ ok: true, alert: view(row), paid, balance });
}

export async function deleteAlert(req, env) {
  if (!sameOrigin(req)) return bad('origin', 403);
  const device = deviceOf(req); if (!device) return bad('device');
  const b = await req.json().catch(() => null) || {};
  const user = await passUser(req, env);
  await env.DB.prepare('DELETE FROM price_alerts WHERE id=? AND (device=? OR (?<>\'\' AND user_id=?))').bind(str(b.id, 24), device, user ? user.id : '', user ? user.id : '').run();
  return json({ ok: true });
}

/** The phone's push subscription, for the alerts made on it. */
export async function syncEndpoint(req, env) {
  if (!sameOrigin(req)) return bad('origin', 403);
  const device = deviceOf(req); if (!device) return bad('device');
  const b = await req.json().catch(() => null) || {};
  if (!okEndpoint(b.endpoint)) return bad('sub');
  await env.DB.prepare('UPDATE price_alerts SET endpoint=? WHERE device=?').bind(b.endpoint, device).run();
  return json({ ok: true });
}

/** What the phone shows; read by the service worker through /api/push/msg. */
export function alertMessage(r, best) {
  const when = r.flex ? 'ב' + ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'][+best.date.slice(5, 7) - 1] : 'ב־' + best.date.slice(8, 10) + '.' + best.date.slice(5, 7);
  return { title: `ירידת מחיר: ${r.name} ב־₪${best.price}`, body: `טיסה הלוך ושוב ${when}, ₪${best.price} לנוסע (היעד שלכם: ₪${r.target}). המחירים משתנים מהר.`, url: '/#flight' };
}

/** Hourly: checks the alerts not checked for a while, tells the phone when a price reaches the target. */
export async function runAlerts(env, now = Date.now(), fetchImpl = fetch) {
  await env.DB.prepare('DELETE FROM price_alerts WHERE date<?').bind(isoDay(now)).run();
  const rows = (await env.DB.prepare('SELECT * FROM price_alerts WHERE checked<? ORDER BY checked LIMIT ?').bind(now - CHECK_EVERY, PER_RUN).all()).results || [];
  let sent = 0;
  for (const r of rows) {
    const best = await lookup(env, r, fetchImpl);
    if (!best) { await env.DB.prepare('UPDATE price_alerts SET checked=? WHERE id=?').bind(now, r.id).run(); continue; }
    // Tell again only when it drops clearly below what was already told.
    const tell = best.price <= r.target && (!r.notified_price || best.price <= r.notified_price - Math.max(20, Math.round(r.notified_price * 0.03)));
    await env.DB.prepare('UPDATE price_alerts SET checked=?, best_price=?, best_date=?, best_link=?, notified_price=? WHERE id=?')
      .bind(now, best.price, best.date, best.link, tell ? best.price : r.notified_price, r.id).run();
    if (tell && r.endpoint) {
      await env.DB.prepare('INSERT INTO kv (k,v) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').bind('amsg:' + await subId(r.endpoint), JSON.stringify(alertMessage(r, best))).run();
      if (!(await wake(env, r.endpoint))) await env.DB.prepare('UPDATE price_alerts SET endpoint=\'\' WHERE id=?').bind(r.id).run();
      sent++;
    }
  }
  return { checked: rows.length, sent };
}

/** A waiting price-alert message for this phone, taken once. */
export async function takeAlertMessage(env, endpoint) {
  const k = 'amsg:' + await subId(endpoint);
  const row = await env.DB.prepare('SELECT v FROM kv WHERE k=?').bind(k).first();
  if (!row) return null;
  await env.DB.prepare('DELETE FROM kv WHERE k=?').bind(k).run();
  try { return JSON.parse(row.v); } catch { return null; }
}

/** For Hania Today: the person's alerts, the ones at their price first. */
export async function alertsForUser(env, userId) {
  const rows = (await env.DB.prepare('SELECT * FROM price_alerts WHERE user_id=? ORDER BY created').bind(userId).all()).results || [];
  return rows.map(view).map((a) => ({ name: a.name, date: a.date, flex: a.flex, target: a.target, best: a.best, hit: a.hit })).sort((x, y) => Number(y.hit) - Number(x.hit)).slice(0, 5);
}
