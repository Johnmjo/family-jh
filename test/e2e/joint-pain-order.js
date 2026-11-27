// Browser walk-through of joint pain after each exercise (run by hand; needs Playwright).
// Usage: DATA_DIR=./data-local node test/seed.js && DATA_DIR=./data-local DEV_USER_EMAIL=you@example.com BASE_PATH=/jh node server/index.js
//        then: node test/e2e/joint-pain-order.js   (uses the seeded workout 14)
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  p.on('pageerror', (e) => console.log('PAGEERR', e.message));
  await p.goto('http://localhost:8086/jh/workout/14'); await p.waitForTimeout(1200);
  const sheet = async () => { const s = await p.$('.sheet'); return s ? (await s.innerText()).replace(/\s+/g, ' ') : null; };
  const settle = async () => { await p.waitForTimeout(700); for (let i = 0; i < 3; i++) { const t = await sheet(); if (t && /from last time/.test(t)) { await p.click('.sheet [data-sv="on_time"]'); await p.waitForTimeout(700); } else if (t && (await p.$('.sheet #er'))) { await p.fill('.sheet #er', '10'); const ew = await p.$('.sheet #ew'); if (ew && !(await ew.inputValue())) await p.fill('.sheet #ew', '40'); await p.click('.sheet [data-logit]'); await p.waitForTimeout(900); } } };
  const api = async () => p.evaluate(async () => (await fetch('/jh/api/workouts/14')).json());
  const done = async (id) => { const w = await api(); for (const x of w.exercises) for (const s of x.sets) if (s.id === id) return !!s.done; return null; };
  const qs = async () => { const t = await sheet(); if (!t) return 'NO SHEET'; const j = (t.match(/during ([^?]+)\?/g) || []).join(' | '); return `joint: [${j}] pump:${/Amazing/.test(t)} volume:${/Too much/.test(t)} soreness:${/recover/.test(t)}`; };
  const answer = async () => { for (const g of await p.$$('.sheet .fb-tiles')) await (await g.$('button:nth-child(2)')).click(); await p.click('.sheet [data-fbsave]'); await p.waitForTimeout(900); };
  const closeX = async () => { await p.click('.sheet [data-fbx]'); await p.waitForTimeout(600); };
  const xOf = async (id) => { const w = await api(); return w.exercises.find((x) => x.sets.some((s) => s.id === id)).id; };
  const log = async (id) => {
    if (!(await p.$(`[data-log="${id}"]`))) { await p.click(`[data-toggle="${await xOf(id)}"]`); await p.waitForTimeout(300); }
    await p.click(`[data-log="${id}"]`, { timeout: 4000 }); await settle();
  };
  const toasts = async () => (await p.$$eval('.toast', (e) => e.map((x) => x.innerText))).join(' / ');
  const btns = async (sel) => p.$$eval(sel, (e) => e.map((x) => x.innerText.replace(/\s+/g, ' ')));

  await log(146); console.log('146 done:', await done(146), '| sheet:', (await sheet()) ? await qs() : 'none');
  await log(147); console.log('147 (DB press last set) ->', await qs());
  await closeX(); console.log('closed. button:', await btns('[data-fbjoint]'));
  await log(145); console.log('tap Log bench -> reopened:', await qs());
  await closeX(); console.log('closed again; 145 done:', await done(145), '| toast:', await toasts());
  await log(145); console.log('tap Log bench again ->', await qs());
  await answer(); await settle(); console.log('answered; 145 done:', await done(145), '| now ->', await qs());
  await answer(); let w = await api(); console.log('chest checkin joints:', w.checkins.find((c) => c.muscle === 'Chest')?.joints, 'answers:', w.exercises.map((x) => x.joint_answer));
  for (const id of [148, 149]) await log(id);
  console.log('after 149 sheet:', (await sheet()) ? await qs() : 'none');
  await log(150); console.log('150 (triceps last) ->', await qs(), '| RAW:', (await sheet() || '').slice(0, 200));
  await closeX(); console.log('closed. muscle button:', await btns('[data-fbneed]'));
  await log(151); console.log('tap Log lateral raise ->', await qs());
  await answer(); await settle(); console.log('answered; 151 done:', await done(151), '| sheet:', (await sheet()) ? await qs() : 'none');
  await b.close();
})();
