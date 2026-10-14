// Optional Hania360 account (Hania Pass). HaniaGo never requires it. A signed-in person
// can save the trip in their account, and Hania Today then shows the next trip.
// Who is signed in is asked of Hania Pass (Service Binding env.PASS) with the browser's
// own cookie. With no binding the feature is off. Trip keys and device ids never leave.

import { tripKey } from './worker.js';
import { BUILTIN } from './builtin.js';
import { alertsForUser } from './alerts.js';

const MAX_TRIPS = 10, DAY = 864e5;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

export async function passUser(req, env) {
  if (!env.PASS) return undefined;
  const cookie = req.headers.get('cookie') || '';
  if (!/(^|;\s*)hp_session=/.test(cookie)) return null;
  try {
    const res = await env.PASS.fetch('https://pass.internal/api/session', { headers: { cookie } });
    if (!res.ok) return null;
    const d = await res.json();
    return d && d.signedIn && d.user && typeof d.user.id === 'string' ? { id: d.user.id, email: String(d.user.email || '') } : null;
  } catch { return null; }
}

const sameOrigin = (req) => req.headers.get('origin') === new URL(req.url).origin;
const trips = async (env, userId) => (await env.DB.prepare('SELECT trip FROM account_trip WHERE user_id=? ORDER BY created').bind(userId).all()).results.map((r) => r.trip);

export async function getAccount(req, env) {
  const user = await passUser(req, env);
  if (user === undefined) return json({ available: false });
  if (!user) return json({ available: true, signedIn: false });
  const key = tripKey(req), list = await trips(env, user.id);
  return json({ available: true, signedIn: true, email: user.email, linked: !!key && list.includes(key) });
}

async function change(req, env, link) {
  if (!sameOrigin(req)) return json({ error: 'origin' }, 403);
  const key = tripKey(req); if (!key) return json({ error: 'device' }, 400);
  const user = await passUser(req, env);
  if (user === undefined) return json({ error: 'unavailable' }, 404);
  if (!user) return json({ error: 'signed_out' }, 401);
  if (!link) { await env.DB.prepare('DELETE FROM account_trip WHERE user_id=? AND trip=?').bind(user.id, key).run(); return json({ ok: true, linked: false }); }
  const list = await trips(env, user.id);
  if (!list.includes(key)) {
    if (list.length >= MAX_TRIPS) return json({ error: 'too_many' }, 409);
    await env.DB.prepare('INSERT INTO account_trip (user_id,trip,created) VALUES (?,?,?) ON CONFLICT DO NOTHING').bind(user.id, key, Date.now()).run();
  }
  return json({ ok: true, linked: true });
}
export const linkAccount = (req, env) => change(req, env, true);
export const unlinkAccount = (req, env) => change(req, env, false);

/* ---- Hania Today ---- */
export function summaryCors(origin) {
  if (!origin) return null;
  let u; try { u = new URL(origin); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  const h = u.hostname;
  const ok = h === 'hania360.com' || h.endsWith('.hania360.com') || h.endsWith('.lior-hania.workers.dev');
  return ok ? { 'access-control-allow-origin': u.origin, 'access-control-allow-credentials': 'true', vary: 'Origin' } : null;
}

/** The trip as Hania Today shows it, or null when it is over, unset or unreadable. */
export function tripSummary(stateText, now = Date.now()) {
  let S; try { S = JSON.parse(stateText); } catch { return null; }
  if (!S || typeof S !== 'object' || !/^\d{4}-\d{2}-\d{2}$/.test(String(S.date || ''))) return null;
  const custom = (S.custom && S.custom[S.dest]) || null;
  const dest = String((custom && custom.n) || (BUILTIN[S.dest] && BUILTIN[S.dest].n) || '').slice(0, 60);
  if (!dest) return null;
  const nights = Math.max(0, Math.min(60, Math.round(+S.nights || 0)));
  const today = Date.parse(new Date(now).toISOString().slice(0, 10)), start = Date.parse(S.date);
  const daysTo = Math.round((start - today) / DAY);
  if (daysTo + nights < 0) return null;
  return { dest, date: S.date, nights, people: Array.isArray(S.fam) ? S.fam.length : 0, daysTo };
}

export async function accountSummary(req, env) {
  const cors = summaryCors(req.headers.get('origin'));
  const reply = (body) => { const r = json(body); if (cors) for (const [k, v] of Object.entries(cors)) r.headers.set(k, v); return r; };
  const user = await passUser(req, env);
  if (user === undefined) return reply({ available: false });
  if (!user) return reply({ available: true, signedIn: false });
  const out = [];
  for (const key of await trips(env, user.id)) {
    const row = await env.DB.prepare('SELECT state FROM trips WHERE device=?').bind(key).first();
    const t = row && tripSummary(row.state);
    if (t) out.push(t);
  }
  out.sort((a, b) => a.daysTo - b.daysTo);
  return reply({ available: true, signedIn: true, trips: out.slice(0, 3), alerts: await alertsForUser(env, user.id).catch(() => []) });
}

export function summaryPreflight(req) {
  const cors = summaryCors(req.headers.get('origin'));
  return new Response(null, { status: 204, headers: cors ? { ...cors, 'access-control-allow-methods': 'GET', 'access-control-max-age': '600' } : {} });
}
