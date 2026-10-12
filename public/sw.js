// Network first, so a new version shows up on the next load; the cache is only the offline fallback.
const CACHE = 'haniago-v3';
const SHARED = 'haniago-shared';
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/icons/icon-192.png']))); });
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== SHARED).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method === 'POST' && u.origin === location.origin && u.pathname === '/share-in') { e.respondWith(shareIn(e.request)); return; }
  // Photos of the places on the route, kept for the trip so they show without internet.
  if (e.request.method === 'GET' && u.hostname === 'upload.wikimedia.org') { e.respondWith(caches.open(CACHE).then((c) => c.match(e.request).then((hit) => hit || fetch(e.request).then((r) => { c.put(e.request, r.clone()); return r; })))); return; }
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); } return r; }).catch(() => caches.match(e.request).then((r) => r || caches.match('/'))));
});

// Something was shared to HaniaGo from another app. Photos are kept on the phone for the trip video page;
// a link or text (a place from Google Maps) opens the app the way it always did.
async function shareIn(req) {
  let fd; try { fd = await req.formData(); } catch { return Response.redirect('/', 303); }
  const files = fd.getAll('photos').filter((f) => f && typeof f === 'object' && f.size);
  if (files.length) {
    await caches.delete(SHARED); const c = await caches.open(SHARED);
    await Promise.all(files.slice(0, 200).map((f, i) => c.put('/shared/' + i, new Response(f, { headers: { 'content-type': f.type || 'image/jpeg', 'x-name': encodeURIComponent(f.name || 'photo-' + i + '.jpg'), 'x-modified': String(f.lastModified || 0) } }))));
    return Response.redirect('/lab/video.html?shared=' + files.length, 303);
  }
  const q = new URLSearchParams(); for (const k of ['st', 'sx', 'su']) { const v = fd.get(k); if (typeof v === 'string' && v) q.set(k, v.slice(0, 2000)); }
  return Response.redirect('/?' + q.toString(), 303);
}

// A reminder arrives without content; the message waits on the server for this phone.
self.addEventListener('push', (e) => {
  e.waitUntil((async () => {
    let m = null;
    try {
      const sub = await self.registration.pushManager.getSubscription();
      const r = await fetch('/api/push/msg', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: sub && sub.endpoint }) });
      m = r.ok ? await r.json() : null;
    } catch { m = null; }
    if (!m || !m.title) m = { title: 'HaniaGo', body: 'יש עדכון לטיול שלכם.', url: '/' };
    await self.registration.showNotification(m.title, { body: m.body, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', lang: 'he', dir: 'rtl', data: { url: m.url || '/' } });
  })());
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ws) => {
    for (const w of ws) if (w.url.startsWith(self.location.origin) && 'focus' in w) return w.navigate(url).then((x) => (x || w).focus());
    return self.clients.openWindow(url);
  }));
});
