import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('insurance handoff uses the published page and sends only the agreed trip fields', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const code = html.match(/var INS_PAGE=[^\n]+\nfunction insUrl\(d\)[^\n]+/)[0];
  const context = { S: { date: '2026-11-15', fam: [{ a: 38, name: 'PRIVATE' }, { a: 8, name: 'PRIVATE' }] }, AFF: {}, nights: () => 4, addDays: () => '2026-11-19', location: { origin: 'https://go.hania360.com' }, encodeURIComponent };
  vm.runInNewContext(code, context);
  const url = new URL(context.insUrl({ n: 'רומא' }));
  assert.equal(url.origin + url.pathname, 'https://save.hania360.com/insurance/travel');
  assert.deepEqual(Object.fromEntries(url.searchParams), { destination: 'רומא', start: '2026-11-15', end: '2026-11-19', ages: '38,8', return: 'https://go.hania360.com' });
  assert.ok(!url.href.includes('PRIVATE'));
});
