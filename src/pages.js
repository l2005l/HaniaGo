// Server-rendered destination pages, so search engines have real text to read.
import { BUILTIN } from './builtin.js';

const SITE = 'https://go.hania360.com';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slugOf = (k) => BUILTIN[k].en.toLowerCase().replace(/[^a-z]+/g, '-');
export const PAGES = Object.fromEntries(Object.keys(BUILTIN).map((k) => [slugOf(k), k]));
const nis = (n) => '₪' + Math.round(n).toLocaleString('en-US');
const who = { kids: 'לילדים', all: 'לכל המשפחה', adults: 'למבוגרים ולילדים גדולים' };

const CSS = `:root{--bg:#EEF4F5;--surface:#fff;--ink:#12303A;--muted:#567079;--line:#D3DFE2;--sea:#0B7A8C;--sun:#F2B01E}
@media (prefers-color-scheme:dark){:root{--bg:#0C1A1F;--surface:#15272E;--ink:#E6F0F2;--muted:#93ABB3;--line:#294049;--sea:#45BACD}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:'Assistant','Arial Hebrew',Arial,sans-serif;font-size:17px;line-height:1.6}
.w{max-width:680px;margin:0 auto;padding:20px 16px 60px}h1{font-size:30px;line-height:1.2;margin:8px 0 12px}h2{font-size:22px;margin:28px 0 10px}h3{font-size:18px;margin:0 0 4px}
p{margin:0 0 12px}a{color:var(--sea)}.m{color:var(--muted);font-size:15px}.c{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:14px;margin:0 0 12px}
.t{display:inline-block;font-size:13px;font-weight:600;padding:2px 9px;border-radius:99px;background:var(--bg);margin-inline-end:6px}
.b{display:block;text-align:center;background:var(--sea);color:#fff;font-weight:700;font-size:18px;padding:14px;border-radius:14px;text-decoration:none;margin:20px 0}
@media (prefers-color-scheme:dark){.b{color:#06222A}}ol{padding-inline-start:22px}li{margin-bottom:6px}.logo{font-weight:800;font-size:20px;text-decoration:none;color:var(--ink)}.logo span{color:var(--sea)}`;

function shell(title, desc, path, body) {
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${SITE}${path}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:type" content="article"><meta property="og:url" content="${SITE}${path}"><link rel="icon" href="/favicon.ico"><link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Assistant:wght@400;600;700;800&display=swap" rel="stylesheet"><style>${CSS}</style></head><body><div class="w"><a class="logo" href="/">Hania<span>Go</span></a>${body}<p class="m">המחירים, הגילים וזמני הביקור בעמוד הם הערכה לתכנון. לפני שמזמינים כדאי לבדוק שעות פתיחה ומחירים מול המקום עצמו. · <a href="/d">כל היעדים</a> · <a href="/">תכנון טיול ב-HaniaGo</a></p></div></body></html>`;
}

/* a simple day plan: the days in the middle get two places each, close to each other */
export function sampleDays(d, nights) {
  const km = (a, b) => { const r = Math.PI / 180, x = (b.lo - a.lo) * r * Math.cos((a.la + b.la) / 2 * r), y = (b.la - a.la) * r; return Math.sqrt(x * x + y * y) * 6371; };
  const left = d.at.filter((x) => x.who !== 'adults').concat(d.at.filter((x) => x.who === 'adults')), days = [];
  for (let i = 0; i <= nights && left.length; i++) {
    const first = left.shift(), day = [first];
    if (i > 0 && i < nights && left.length) { let b = 0; left.forEach((x, j) => { if (km(first, x) < km(first, left[b])) b = j; }); day.push(left.splice(b, 1)[0]); }
    days.push(day);
  }
  return days;
}

export function destPage(slug) {
  const k = PAGES[slug]; if (!k) return null;
  const d = BUILTIN[k], nights = d.abroad ? 4 : 2, free = d.at.filter((x) => !x.a && !x.c), small = d.at.filter((x) => x.min <= 3 && x.who !== 'adults');
  const title = `${d.n} עם ילדים: מה לעשות ומסלול ל-${nights + 1} ימים`;
  const desc = `${d.at.length} מקומות ב${d.n} שמתאימים למשפחות, עם גיל מומלץ, טיפ לכל מקום, ${free.length} מקומות בחינם, ומסלול מוצע לכל יום.`;
  const item = (x) => `<div class="c"><h3>${esc(x.n)}</h3><p><span class="t">${who[x.who]}</span>${x.min ? `<span class="t">מגיל ${x.min}</span>` : ''}<span class="t">${x.a || x.c ? `מבוגר ${nis(x.a)}, ילד ${x.c ? nis(x.c) : 'חינם'}` : 'כניסה חופשית'}</span></p><p>${esc(x.rec)}.${x.note ? ` כדאי לדעת: ${esc(x.note)}.` : ''}</p></div>`;
  const days = sampleDays(d, nights);
  const body = `<h1>${esc(title)}</h1>
<p>${d.abroad ? `טיסה ישירה מתל אביב ל${esc(d.n)} אורכת בערך ${Math.floor(d.dur / 60)} שעות${d.dur % 60 ? ` ו-${d.dur % 60} דקות` : ''}.` : `${esc(d.n)} מתאימה לחופשה קצרה בארץ, בלי טיסה.`} ריכזנו כאן ${d.at.length} מקומות שמתאימים למשפחות, עם הגיל שממנו כדאי להגיע, טיפ מעשי לכל מקום ומחיר כניסה משוער.</p>
<a class="b" href="/?from=page&dest=${k}">לתכנן טיול ל${esc(d.n)} לפי הגילים שלכם</a>
<h2>מסלול מוצע ל-${nights + 1} ימים</h2>
<ol>${days.map((day, i) => `<li><strong>יום ${i + 1}${i === 0 ? ' (הגעה)' : i === nights ? ' (חזרה)' : ''}:</strong> ${day.map((x) => esc(x.n)).join(', ואחר כך ')}.</li>`).join('')}</ol>
<p class="m">זו נקודת פתיחה. ב-HaniaGo המסלול מותאם לגיל של כל ילד, ולכל יום יש זמני נסיעה, עלות וניווט מוכן.</p>
${small.length ? `<h2>לילדים קטנים</h2><p>${small.map((x) => esc(x.n)).join(', ')} מתאימים גם לפעוטות ולילדי גן.</p>` : ''}
${free.length ? `<h2>מה אפשר לעשות ב${esc(d.n)} בחינם</h2><p>${free.map((x) => esc(x.n)).join(', ')}.</p>` : ''}
<h2>כל המקומות</h2>${d.at.map(item).join('')}
<h2>כמה זה עולה</h2><p>${d.abroad ? `טיסה הלוך ושוב עולה בדרך כלל סביב ${nis(d.fl)} לאדם, ומלון משפחתי במרכז סביב ${nis(d.hotelP)} ללילה.` : `מלון משפחתי עולה סביב ${nis(d.hotelP)} ללילה.`} כניסה לכל המקומות בתשלום שבעמוד, לשני מבוגרים ושני ילדים, מסתכמת בכ-${nis(d.at.reduce((t, x) => t + x.a * 2 + x.c * 2, 0))}.</p>
<a class="b" href="/?from=page&dest=${k}">לבנות את המסלול שלכם ל${esc(d.n)}</a>`;
  return shell(title, desc, '/d/' + slug, body);
}

export function indexPage() {
  const body = `<h1>יעדים לטיול משפחתי</h1><p>לכל יעד: מקומות שמתאימים לילדים, גיל מומלץ, מה אפשר לעשות בחינם, ומסלול מוצע לכל יום.</p>${Object.entries(PAGES).map(([slug, k]) => `<div class="c"><h3><a href="/d/${slug}">${esc(BUILTIN[k].n)} עם ילדים</a></h3><p class="m">${BUILTIN[k].at.length} מקומות · ${BUILTIN[k].abroad ? 'חו״ל' : 'בארץ'}</p></div>`).join('')}<a class="b" href="/?from=page">לתכנן טיול לכל יעד אחר</a>`;
  return shell('יעדים לטיול משפחתי עם ילדים | HaniaGo', 'מסלולים ומקומות לטיול משפחתי בארץ ובחו״ל, לפי גיל הילדים.', '/d', body);
}

export function sitemap() {
  const urls = ['/', '/d'].concat(Object.keys(PAGES).map((s) => '/d/' + s));
  return '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + urls.map((u) => `<url><loc>${SITE}${u}</loc></url>`).join('') + '</urlset>';
}
