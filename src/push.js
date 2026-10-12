// Web push without a payload: the phone is only woken up, then its service worker asks /api/push/msg
// what to show. That avoids encrypting messages; only the VAPID signature is needed.
// The key pair is made once and kept in D1, so nobody has to handle a secret.

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const enc = new TextEncoder();
const HOSTS = [/(^|\.)fcm\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/];

export function okEndpoint(u) {
  try { const x = new URL(u); return x.protocol === 'https:' && u.length <= 800 && HOSTS.some((h) => h.test(x.hostname)); } catch { return false; }
}

export async function vapid(env) {
  const row = await env.DB.prepare("SELECT v FROM kv WHERE k='vapid'").first();
  if (row) return JSON.parse(row.v);
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const v = { pub: b64u(await crypto.subtle.exportKey('raw', kp.publicKey)), jwk: await crypto.subtle.exportKey('jwk', kp.privateKey) };
  await env.DB.prepare("INSERT OR IGNORE INTO kv (k,v) VALUES ('vapid',?)").bind(JSON.stringify(v)).run();
  return JSON.parse((await env.DB.prepare("SELECT v FROM kv WHERE k='vapid'").first()).v);
}

export async function vapidHeader(env, endpoint, now = Date.now()) {
  const v = await vapid(env), key = await crypto.subtle.importKey('jwk', v.jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const part = (o) => b64u(enc.encode(JSON.stringify(o)));
  const body = part({ typ: 'JWT', alg: 'ES256' }) + '.' + part({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: 'https://go.hania360.com' });
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(body));
  return 'vapid t=' + body + '.' + b64u(sig) + ', k=' + v.pub;
}

// Wakes the phone. Returns false when the subscription is gone and should be removed.
export async function wake(env, endpoint) {
  try {
    const r = await fetch(endpoint, { method: 'POST', headers: { Authorization: await vapidHeader(env, endpoint), TTL: '43200', Urgency: 'normal', 'Content-Length': '0' } });
    return !(r.status === 404 || r.status === 410);
  } catch { return true; }
}

export async function subId(endpoint) {
  return b64u(await crypto.subtle.digest('SHA-256', enc.encode(endpoint))).slice(0, 32);
}

// Israel date and hour, the clock the reminders run on.
export function ilNow(now = Date.now()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(now)).map((x) => [x.type, x.value]));
  return { day: p.year + '-' + p.month + '-' + p.day, hour: +p.hour };
}
const dayDiff = (a, b) => Math.round((Date.parse(a + 'T12:00:00Z') - Date.parse(b + 'T12:00:00Z')) / 864e5);

// The one reminder this trip should get now, if any. trip: {dest, abroad, date, nights, days: [[names]], camOk}
export function dueMessage(trip, now, sent = [], rainTomorrow = false) {
  if (!trip || !/^\d{4}-\d{2}-\d{2}$/.test(trip.date || '')) return null;
  const off = dayDiff(now.day, trip.date), n = Math.max(1, Math.min(14, +trip.nights || 1)), dest = String(trip.dest || 'היעד').slice(0, 40), h = now.hour;
  const out = (key, title, body, url) => (sent.includes(key) ? null : { key, title, body, url });
  if (off === -3 && h >= 10 && !trip.camOk) return out('cam', 'עוד 3 ימים ל' + dest, 'כדי שבסוף הטיול ייצא סרטון עם שמות המקומות, הפעילו שמירת מיקום בהגדרות המצלמה. ההוראות באפליקציה.', '/#camera');
  if (off === -1 && h >= 18) return out('pre', trip.abroad ? 'מחר טסים ל' + dest : 'מחר יוצאים ל' + dest, trip.abroad ? 'צ׳ק אין, כרטיסי עלייה ושעת היציאה מהבית מחכים באפליקציה.' : 'שעת היציאה ורשימת הציוד מחכים באפליקציה.', '/#leave');
  if (off >= 0 && off < n && h >= 20) {
    const next = ((trip.days || [])[off + 1] || []).filter(Boolean).slice(0, 2);
    return out('night' + off, 'מחר ב' + dest + ', יום ' + (off + 2), (rainTomorrow ? 'צפוי גשם מחר. במסלול יש אפשרות עם יותר מקומות סגורים. ' : next.length ? 'מתחילים ב' + next.join(' ואחר כך ') + '. ' : '') + 'והתמונות של היום נשמרות בגלריה לסרטון בסוף הטיול.', '/#plan');
  }
  if (off === n + 1 && h >= 11) return out('video', 'איך היה ב' + dest + '?', 'הכינו סרטון קצר מהתמונות שצילמתם, עם המפה והמקומות, ושלחו למשפחה ולחברים.', '/lab/video.html');
  return null;
}

export function cleanTrip(t) {
  if (!t || typeof t !== 'object') return null;
  const s = (x, n) => String(x == null ? '' : x).slice(0, n);
  const num = (x) => (Number.isFinite(+x) ? +x : null);
  return {
    dest: s(t.dest, 40), abroad: !!t.abroad, date: /^\d{4}-\d{2}-\d{2}$/.test(t.date || '') ? t.date : '', nights: Math.max(1, Math.min(14, +t.nights || 1)),
    la: num(t.la), lo: num(t.lo), camOk: !!t.camOk,
    days: Array.isArray(t.days) ? t.days.slice(0, 15).map((d) => (Array.isArray(d) ? d.slice(0, 3).map((x) => s(x, 60)) : [])) : [],
  };
}
