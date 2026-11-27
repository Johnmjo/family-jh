// Browser check: type reps (or a weight) in a set row and tap Log right away.
// The typed number must be the one logged, with or without a rep target, offline too,
// and a failed save must log nothing. Needs Playwright (not a dependency of the app).
// Usage: DATA_DIR=./data-local node test/seed.js && DATA_DIR=./data-local DEV_USER_EMAIL=you@example.com BASE_PATH=/jh node server/index.js
//        then: node test/e2e/log-typed-reps.js <pw|nojsblur|fail|offline> <1 = set has a rep target, 0 = none>
//        (nojsblur = a tap that does not close the box, like iOS)
const { chromium } = require('playwright');
const Database = require('better-sqlite3');
const db = new Database(require('path').join(process.env.DATA_DIR || 'data-local', 'jh.db'));
const [mode, withT] = [process.argv[2], process.argv[3] === '1'];
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.goto('http://localhost:8086/jh/'); await p.waitForTimeout(1000);
  const wid = Number(p.url().split('/').pop());
  const s = db.prepare(`SELECT s.* FROM sets s JOIN wex x ON x.id=s.wex_id WHERE x.workout_id=? AND s.done=0 AND s.kind='regular' ORDER BY x.pos, s.pos LIMIT 1`).get(wid);
  db.prepare('UPDATE sets SET target_reps=?, reps=NULL WHERE id=?').run(withT ? 9 : null, s.id);
  await p.reload(); await p.waitForTimeout(1000);
  let puts = [];
  if (mode === 'fail') await p.route('**/api/sets/**', async (r) => { if (r.request().method() === 'PUT' && !puts.length) { puts.push(1); return r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Test failure"}' }); } return r.continue(); });
  if (mode === 'offline') await p.route('**/api/**', (r) => r.request().method() === 'GET' ? r.continue() : r.abort());
  await p.click(`[data-edit="${s.id}"][data-field="r"]`);
  await p.keyboard.type('13');
  if (mode !== 'nojsblur') await p.click(`[data-log="${s.id}"]`);
  else await p.$eval(`[data-log="${s.id}"]`, el => el.click()); // tap that does not close the box (like iOS)
  // also a fast second tap
  await p.$eval(`[data-log="${s.id}"]`, el => el.click()).catch(() => {});
  for (let i = 0; i < 6; i++) {
    await p.waitForTimeout(600);
    const sh = await p.$('.sheet');
    if (!sh) continue;
    const txt = (await sh.innerText()).replace(/\s+/g, ' ');
    console.log('SHEET:', txt.slice(0, 120));
    if (/Reps/.test(txt) && await sh.$('#er')) { console.log('=> REPS POPUP SHOWN'); break; }
    const btn = await sh.$('[data-sv], [data-v], .btn.primary'); if (btn) await btn.click(); else break;
  }
  await p.waitForTimeout(800);
  if (mode === 'offline') { console.log('queued:', await p.evaluate(() => Object.keys(localStorage).map(k => localStorage[k]).join(' ').slice(0, 400))); await p.unroute('**/api/**'); await p.evaluate(async () => { const m = await import('./js/ui.js'); await m.flush(); }); await p.waitForTimeout(800); }
  const toasts = await p.$$eval('.toast', e => e.map(x => x.innerText)); console.log('toasts:', toasts);
  const after = db.prepare('SELECT reps, done FROM sets WHERE id=?').get(s.id);
  const n = db.prepare('SELECT COUNT(*) c FROM sets WHERE wex_id=? AND done=1').get(s.wex_id).c;
  console.log(mode, withT ? 'target' : 'no-target', '=>', JSON.stringify(after), 'done sets in exercise:', n);
  db.prepare('UPDATE sets SET done=0, reps=NULL, logged_at=NULL WHERE id=?').run(s.id);
  await b.close();
})();
