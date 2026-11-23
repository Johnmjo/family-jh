'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../server/engine');
const LB = E.DEFAULT_SETTINGS.lb; const KG = E.DEFAULT_SETTINGS.kg;
const bar = E.loadModel('Barbell', LB); const barKg = E.loadModel('Barbell', KG);
const db = E.loadModel('Dumbbell', LB); const mach = E.loadModel('Machine', LB);
const sum = (b, plates) => b + 2 * plates.reduce((a, p) => a + p, 0);

test('plates per side add back up to the total, lb and kg', () => {
  for (let w = 45; w <= 600; w += 5) {
    const p = E.platesPerSide(w, bar);
    assert.ok(p, `no plates for ${w}`);
    assert.equal(Math.round(sum(45, p) * 100) / 100, w, `${w} lb -> ${p}`);
  }
  for (let w = 20; w <= 300; w += 2.5) {
    const p = E.platesPerSide(w, barKg);
    assert.ok(p, `no plates for ${w} kg`);
    assert.equal(Math.round(sum(20, p) * 100) / 100, w);
  }
  assert.deepEqual(E.platesPerSide(235, bar), [45, 45, 5]);
  assert.deepEqual(E.platesPerSide(175, bar), [45, 10, 10]);
  assert.deepEqual(E.platesPerSide(200, bar), [45, 25, 5, 2.5]);
  assert.deepEqual(E.platesPerSide(45, bar), []);
  assert.equal(E.platesPerSide(47, bar), null); // can't be built
});
test('limited plate counts', () => {
  const m = { kind: 'plates', bar: 45, plates: [45, 25, 10, 5, 2.5], counts: [1, 1, 2, 1, 1] };
  const p = E.platesPerSide(225, m); // 90 per side: 45+25+10+10
  assert.deepEqual(p, [45, 25, 10, 10]);
  assert.equal(E.platesPerSide(315, m), null);
  assert.equal(E.roundLoad(315, m, 'floor'), 45 + 2 * 97.5);
});
test('rounding to loadable weights', () => {
  assert.equal(E.roundLoad(102.5, bar, 'floor'), 100);
  assert.equal(E.roundLoad(102.5, bar, 'nearest'), 100); // ties go down
  assert.equal(E.roundLoad(103, bar, 'nearest'), 105);
  assert.equal(E.roundLoad(30, bar), 45);
  assert.equal(E.roundLoad(25.6, db, 'floor'), 25);
  assert.equal(E.roundLoad(102.5, mach, 'floor'), 102.5);
  assert.equal(E.roundLoad(94.5, mach, 'nearest'), 95);
  assert.equal(E.roundLoad(61.3, barKg, 'nearest'), 62.5);
});
test('e1rm and weightFor are inverses', () => {
  assert.equal(E.e1rm(100, 1), 100);
  assert.ok(Math.abs(E.e1rm(185, 9) - 240.5) < 1e-9);
  assert.ok(Math.abs(E.weightFor(E.e1rm(185, 9, 2), 9, 2) - 185) < 1e-9);
  assert.equal(E.e1rm(0, 5), null);
});
test('weekly RIR', () => {
  assert.deepEqual(E.rirSchedule(4), [2, 1, 0, 8]);
  assert.deepEqual(E.rirSchedule(6), [3, 2, 2, 1, 0, 8]);
  assert.deepEqual(E.rirSchedule(4, false), [3, 2, 1, 0]);
  for (let w = 4; w <= 8; w++) { const s = E.rirSchedule(w); assert.equal(s.length, w); assert.equal(s[w - 2], 0); }
});
test('progression matches the tests in the old app', () => {
  // machine 100 -> 102.5 -> 105, reps follow what you did
  assert.deepEqual(E.nextTarget({ weight: 100, reps: 12 }, mach).weight, 102.5);
  assert.deepEqual(E.nextTarget({ weight: 100, reps: 12 }, mach).reps, 12);
  assert.equal(E.nextTarget({ weight: 102.5, reps: 11 }, mach).weight, 105);
  // barbell 100: +5 is too big, so +1 rep
  let t = { weight: 100, reps: 10 };
  for (let i = 0; i < 4; i++) { t = E.nextTarget(t, bar); }
  assert.deepEqual([t.weight, t.reps], [100, 14]);
  // 25 lb dumbbell holds, reps +1
  assert.deepEqual(E.nextTarget({ weight: 25, reps: 12 }, db), { weight: 25, reps: 13, why: '+1 rep (next weight step is too big)' });
  // heavy barbell goes up
  assert.equal(E.nextTarget({ weight: 200, reps: 8 }, bar).weight, 205);
  // logged lighter -> follows actual
  assert.deepEqual([E.nextTarget({ weight: 90, reps: 8 }, mach).weight, E.nextTarget({ weight: 90, reps: 8 }, mach).reps], [90, 9]); // as seen: logged 90 stays 90
  // deload: 90%, two thirds reps
  assert.deepEqual(E.deloadTarget({ weight: 105, reps: 14 }, mach), { weight: 95, reps: 9 });
  assert.deepEqual(E.deloadTarget({ weight: 25, reps: 14 }, E.loadModel('Dumbbell', { ...LB, dumbbellStep: 2.5 })), { weight: 22.5, reps: 9 });
  assert.deepEqual(E.targetRange(100, mach), [90, 105]);
});
test('sets from check-ins (Appendix A)', () => {
  const d = (pump, workload, priority = 'grow', soreness) => E.setsDelta({ pump, workload, priority, soreness }).delta;
  assert.equal(d('low', 'easy'), 1);
  assert.equal(d('low', 'right'), 1);
  assert.equal(d('good', 'right'), 0);
  assert.equal(d('great', 'right'), 0);
  assert.equal(d('great', 'easy'), 0);
  assert.equal(d('great', 'pushed'), 0);
  assert.equal(d('good', 'pushed', 'grow'), -1);
  assert.equal(d('good', 'pushed', 'focus'), 0);
  assert.equal(d('low', 'too_much'), -1);
  assert.equal(d('great', 'too_much', 'focus'), -1);
  assert.equal(d('low', 'easy', 'maintain'), 0);
  assert.equal(d('low', 'too_much', 'maintain'), -1);
  assert.equal(d('low', 'easy', 'grow', 'sore'), 0);
  assert.deepEqual(E.applySetsDelta([2, 3], 1), [3, 3]);
  assert.deepEqual(E.applySetsDelta([2, 3], -1), [2, 2]);
  assert.deepEqual(E.applySetsDelta([1], -1), [1]);
  assert.deepEqual(E.applySetsDelta([4, 4], 1, 8), [4, 4]);
});
test('trend compares weight and reps together', () => {
  assert.equal(E.trend({ weight: 185, reps: 8 }, { weight: 190, reps: 7 }, bar), 'flat'); assert.equal(E.trend({ weight: 185, reps: 8 }, { weight: 185, reps: 6 }, bar), 'down');
  assert.equal(E.trend({ weight: 185, reps: 8 }, { weight: 185, reps: 9 }, bar), 'up');
  assert.equal(E.trend({ weight: 185, reps: 8 }, { weight: 185, reps: 8 }, bar), 'flat');
});
test('suggested starting weights from history', () => {
  const now = Date.UTC(2026, 10, 24);
  const s = [{ date: now - 28 * 864e5, sets: [{ weight: 185, reps: 9, rir: 0 }, { weight: 185, reps: 8, rir: 0 }] }];
  const g = E.suggestFromHistory(s, { reps: 10, rir: 2, now, model: bar });
  // e1rm 240.5 -> 10 reps at 2 RIR = 240.5/1.4 = 171.8 -> floor 170
  assert.equal(g.weight, 170);
  const old = E.suggestFromHistory([{ ...s[0], date: now - 100 * 864e5 }], { reps: 10, rir: 2, now, model: bar });
  assert.equal(old.weight, 150); // 240.5*.9/1.4=154.6 -> 150
  const mid = E.suggestFromHistory([{ ...s[0], date: now - 50 * 864e5 }], { reps: 10, rir: 2, now, model: bar });
  assert.equal(mid.weight, 160); // 163.2 -> 160
  const sim = E.suggestFromSimilar({ e1rm: 240.5 }, 0.85, { reps: 10, rir: 2, model: bar });
  assert.equal(sim.weight, 135); // 240.5*.85*.95/1.4 = 138.7 -> 135
  assert.equal(sim.confidence, 'rough');
});
test('copy meso start', () => {
  assert.deepEqual(E.copyStart({ weight: 45, reps: 11 }, 0, 2, E.loadModel('Cable', LB)), { weight: 45, reps: 10 });
  const b = E.copyStart({ weight: 195, reps: 3 }, 0, 2, bar);
  assert.equal(b.reps, 5);
  assert.ok(b.weight < 195 && (b.weight - 45) % 5 === 0);
});
test('1RM ramp from 235 lb', () => {
  const r = E.ramp(235, bar);
  assert.deepEqual(r.map((x) => x.weight), [95, 140, 175, 200, 215, 235]);
  for (const x of r) assert.equal(Math.round(sum(45, x.plates) * 100) / 100, x.weight);
  assert.equal(r.at(-1).kind, 'attempt');
  for (let i = 1; i < r.length; i++) assert.ok(r[i].weight > r[i - 1].weight);
  // small max: first warm-up is the empty bar, no duplicate steps
  const s = E.ramp(95, bar);
  assert.equal(s[0].weight, 45);
  for (let i = 1; i < s.length; i++) assert.ok(s[i].weight > s[i - 1].weight);
  for (let m = 60; m <= 500; m += 5) {
    const rr = E.ramp(m, bar);
    for (const x of rr) assert.equal(Math.round(sum(45, x.plates) * 100) / 100, x.weight, `${m}: ${x.weight}`);
  }
  for (let m = 40; m <= 250; m += 2.5) {
    const rr = E.ramp(m, barKg);
    for (const x of rr) assert.equal(Math.round(sum(20, x.plates) * 100) / 100, x.weight);
  }
  assert.equal(E.nextAttempt(235, bar, 5), 245); // 240.9 -> ceil 245
  assert.equal(E.nextAttempt(100, bar, 5), 105);
});
test('timer', () => {
  const t = E.restState(1000, 1000 + 134000, 120);
  assert.deepEqual([t.elapsed, t.reached], [134, true]);
  assert.equal(E.clock(134), '2:14');
  assert.equal(E.clock(3725), '1:02:05');
  assert.equal(E.restState(null, 1, 1), null);
});

test('QA v1 fixes: deload always drops, ranges have width', () => {
  const s = E.DEFAULT_SETTINGS.lb; const dbm = E.loadModel('Dumbbell', s);
  assert.equal(E.deloadTarget({ weight: 15, reps: 12 }, dbm).weight, 15);
  for (const w of [25, 75, 125]) assert.ok(E.deloadTarget({ weight: w, reps: 12 }, dbm).weight < w, `deload ${w}`);
  const r = E.targetRange(20, dbm); assert.ok(r[0] < 20 && r[1] > 20);
  const k = E.targetRange(10, E.loadModel('Dumbbell', E.DEFAULT_SETTINGS.kg)); assert.ok(k[0] < 10 && k[1] > 10);
});
