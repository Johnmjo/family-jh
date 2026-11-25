'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os'); const fs = require('fs'); const path = require('path');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'jh-'));
const { db } = require('../server/db');
const S = require('../server/store');
const { ensureMember } = require('../server/auth');

const john = ensureMember('john@example.com');
const kacey = ensureMember('kacey@example.com');
const ex = (name) => db.prepare('SELECT * FROM exercises WHERE name=? AND owner_id IS NULL').get(name);
const U = () => db.prepare('SELECT * FROM users WHERE id=?').get(john.id);

function logAll(w, fn) {
  for (const x of w.exercises) for (const s of x.sets) {
    const v = fn(x, s); if (v === null) continue;
    S.updateSet(U(), s.id, { weight: v.weight, reps: v.reps, done: true });
  }
}

test('library loaded with 299 exercises', () => {
  assert.equal(db.prepare('SELECT COUNT(*) n FROM exercises WHERE owner_id IS NULL').get().n, 299);
});

test('full meso: progression, check-ins, deload, privacy', () => {
  const press = ex('Machine Chest Press'); const curl = ex('Concentration Curl');
  const id = S.createMeso(U(), { name: 'Test', weeks: 4, priorities: { Chest: 'emphasize', Biceps: 'maintain' },
    days: [{ label: 'Push', slots: [{ exercise_id: press.id, sets: 2, start: { weight: 100, reps: 12 } }, { exercise_id: curl.id, sets: 3, start: { weight: 25, reps: 12 } }] }] });
  const v = S.mesoView(U(), id);
  assert.equal(v.total, 4);
  assert.deepEqual(v.rirs, [2, 1, 0, 8]);
  // Kacey can't see it
  assert.throws(() => S.mesoView(kacey, id), /not found/i);
  let w = S.workoutView(U(), v.days[0].workouts[0].id);
  assert.equal(w.exercises[0].sets[0].target_weight, 100);
  // can't log week 2 before week 1
  const w2id = v.days[0].workouts[1].id;
  assert.throws(() => S.workoutAction(U(), w2id, { action: 'finish' }), /earlier/);
  logAll(w, (x, s) => (x.exercise.name === press.name ? { weight: 100, reps: [12, 11][s.pos] } : { weight: 25, reps: [12, 12, 10][s.pos] }));
  S.checkin(U(), w.id, { muscle: 'Chest', pump: 'low', workload: 'easy', joints: 'fine' });
  S.checkin(U(), w.id, { muscle: 'Biceps', pump: 'low', workload: 'easy', joints: 'fine' });
  S.workoutAction(U(), w.id, { action: 'finish' });
  w = S.workoutView(U(), w2id);
  const p = w.exercises.find((x) => x.exercise.name === press.name); const c = w.exercises.find((x) => x.exercise.name === curl.name);
  assert.equal(p.sets.length, 3, 'chest +1 set');
  assert.deepEqual(p.sets.map((s) => [s.target_weight, s.target_reps]), [[102.5, 12], [102.5, 11], [102.5, null]]);
  assert.equal(c.sets.length, 3, 'maintain stays');
  assert.deepEqual(c.sets.map((s) => [s.target_weight, s.target_reps]), [[25, 13], [25, 13], [25, 11]]);
  assert.match(p.why, /\+1 set/);
  assert.equal(p.sets[0].last.reps, 12);
  // week 2: log, too much -> -1 set next week
  logAll(w, (x, s) => (x.exercise.name === press.name ? { weight: 102.5, reps: [12, 11, 10][s.pos] } : { weight: 25, reps: [13, 13, 11][s.pos] }));
  S.checkin(U(), w.id, { muscle: 'Chest', pump: 'great', workload: 'too_much' });
  S.workoutAction(U(), w.id, { action: 'finish' });
  let w3 = S.workoutView(U(), v.days[0].workouts[2].id);
  const p3 = w3.exercises.find((x) => x.exercise.name === press.name);
  assert.equal(p3.sets.length, 2);
  assert.deepEqual(p3.sets.map((s) => s.target_weight), [105, 105]);
  // trend badge: only against an earlier session at the same RIR (none yet at 0 RIR in this meso)
  S.updateSet(U(), p3.sets[0].id, { weight: 105, reps: 13, done: true });
  w3 = S.workoutView(U(), w3.id);
  assert.equal(w3.exercises.find((x) => x.exercise.name === press.name).sets[0].trend, null);
  S.workoutAction(U(), w3.id, { action: 'finish', force: true });
  const dl = S.workoutView(U(), v.days[0].workouts[3].id);
  assert.ok(dl.isDeload);
  const pd = dl.exercises.find((x) => x.exercise.name === press.name);
  assert.equal(pd.sets.length, 2);
  assert.deepEqual([pd.sets[0].target_weight, pd.sets[0].target_reps], [95, 9]); // 105*.9=94.5->95, 13*2/3
  S.workoutAction(U(), dl.id, { action: 'skip' });
  assert.equal(S.mesoView(U(), id).status, 'finished');
});

test('history suggestions and copy meso', () => {
  const press = ex('Machine Chest Press');
  const g = S.suggestFor(U(), press, { rir: 2 });
  assert.equal(g.confidence, 'history');
  assert.ok(g.weight > 0);
  // similar: incline machine press never done -> rough guess from the flat one
  const inc = ex('Machine Chest Press (Incline)');
  const r = S.suggestFor(U(), inc, { rir: 2, reps: 10 });
  assert.equal(r.confidence, 'rough');
  const old = S.mesoList(U())[0];
  const cp = S.copyPreview(U(), old.id);
  assert.equal(cp.suggestedWeek, 3);
  const slot = cp.days[0].slots.find((s) => s.exercise === press.name);
  assert.ok(slot.start && slot.start.weight === 105 && slot.start.reps === 12, JSON.stringify(slot.start));
  const nid = S.createMeso(U(), { name: 'Copy', weeks: 4, days: cp.days, priorities: cp.priorities });
  assert.equal(S.currentMeso(U()).id, nid);
});

test('1RM test ramp replaces a set and logs attempts', () => {
  const bench = ex('Bench Press (Medium Grip)');
  const id = S.createMeso(U(), { name: 'Bench', weeks: 4, days: [{ label: 'A', slots: [{ exercise_id: bench.id, sets: 3, start: { weight: 185, reps: 8 } }] }] });
  const w = S.workoutView(U(), S.mesoView(U(), id).days[0].workouts[0].id);
  const sets = w.exercises[0].sets;
  S.setAction(U(), sets[2].id, { action: 'test1rm', expected: 235 });
  const w2 = S.workoutView(U(), w.id);
  const after = w2.exercises[0].sets;
  assert.deepEqual(after.map((s) => s.kind), ['regular', 'regular', 'warmup', 'warmup', 'warmup', 'warmup', 'warmup', 'attempt']);
  assert.deepEqual(after.slice(2).map((s) => s.target_weight), [95, 140, 175, 200, 215, 235]);
  const att = after[7];
  S.updateSet(U(), after[0].id, { weight: 185, reps: 8, done: true });
  S.setAction(U(), att.id, { action: 'attempt', made: true });
  S.setAction(U(), att.id, { action: 'another' });
  const w3 = S.workoutView(U(), w.id);
  assert.equal(w3.exercises[0].sets.at(-1).target_weight, 245);
  const d = S.exerciseDetail(U(), bench.id);
  assert.equal(d.prs.tested, 235);
});

test('auto-match, skip, export, delete', () => {
  const m = S.currentMeso(U());
  const w = S.workoutView(U(), S.mesoView(U(), m.id).nextId);
  const x = w.exercises[0];
  S.updateSet(U(), x.sets[0].id, { weight: 190 });
  const w2 = S.workoutView(U(), w.id);
  assert.equal(w2.exercises[0].sets[1].weight, 190);
  // reps that only echo the plan (saved by an older edit sheet) still follow a new weight
  const s1 = w2.exercises[0].sets[1];
  S.updateSet(U(), s1.id, { weight: s1.weight, reps: s1.plan_reps });
  S.updateSet(U(), s1.id, { weight: s1.weight + 10 });
  const s1b = S.workoutView(U(), w.id).exercises[0].sets[1];
  assert.equal(s1b.reps, null);
  assert.ok(s1b.target_reps < s1.plan_reps);
  const dump = S.exportAll(U());
  assert.ok(dump.mesos.length >= 3);
  assert.throws(() => S.deleteAll(U(), 'nope'));
  S.deleteAll(kacey, 'DELETE'); // only Kacey's (empty) data
  assert.ok(S.mesoList(U()).length >= 3);
});

test('QA v1 fixes: 1RM on a logged set, stale next week, plate dedupe', () => {
  const press = ex('Machine Chest Press');
  const id = S.createMeso(U(), { name: 'QA fixes', weeks: 4, days: [{ label: 'A', slots: [{ exercise_id: press.id, sets: 2, start: { weight: 100, reps: 12 } }] }] });
  const v = S.mesoView(U(), id);
  let w = S.workoutView(U(), v.days[0].workouts[0].id);
  const [s0, s1] = w.exercises[0].sets;
  // M1: a logged set survives a 1RM test, and the ramp goes below it
  S.updateSet(U(), s0.id, { weight: 100, reps: 12, done: true });
  S.setAction(U(), s0.id, { action: 'test1rm', expected: 200 });
  w = S.workoutView(U(), w.id);
  const sets = w.exercises[0].sets;
  assert.equal(sets[0].id, s0.id); assert.equal(sets[0].done, 1); assert.equal(sets[0].weight, 100);
  assert.ok(sets.some((t) => t.kind === 'attempt'));
  assert.ok(sets.some((t) => t.id === s1.id));
  for (const t of sets) if (!t.done) S.setAction(U(), t.id, { action: 'skip' });
  S.workoutAction(U(), w.id, { action: 'finish' });
  // M2: next week is built, then week 1 is reopened and changed: next week is rebuilt
  const w2id = v.days[0].workouts[1].id;
  let w2 = S.workoutView(U(), w2id);
  assert.equal(w2.exercises[0].sets[0].target_weight, 102.5);
  S.workoutAction(U(), w.id, { action: 'reopen' });
  S.updateSet(U(), s0.id, { weight: 110, reps: 12, done: true });
  S.workoutAction(U(), w.id, { action: 'finish', force: true });
  w2 = S.workoutView(U(), w2id);
  assert.equal(w2.exercises[0].sets[0].target_weight, 112.5);
  // L3: duplicate plate sizes keep their counts
  const st = S.updateSettings(U(), { plates: [25, 25, 20, 10], plateCounts: [1, 2, 1, null] });
  assert.deepEqual(st.plates, [25, 20, 10]); assert.deepEqual(st.plateCounts, [3, 1, null]);
  S.updateSettings(U(), { units: 'lb' });
  S.updateSettings(U(), { plates: [45, 35, 25, 10, 5, 2.5], plateCounts: [] });
});

test('current estimated 1RM comes from the latest 0 RIR session, best-ever kept separately', () => {
  const press = ex('Machine Chest Press');
  const d = S.exerciseDetail(U(), press.id);
  assert.ok(d.prs.current && d.prs.current.value > 0);
  assert.ok(d.prs.current.date > 0 && d.prs.current.reps > 0);
  assert.ok(d.prs.current.value <= d.prs.e1rm + 1);
  const p = S.progress(U()).exercises.find((e) => e.id === press.id);
  assert.equal(p.current.value, d.prs.current.value);
});

test('soreness is asked on a muscle\'s first session of a meso, about its last session in an earlier meso', () => {
  const calf = ex('Standing Calf Raise') || db.prepare("SELECT * FROM exercises WHERE muscle='Calves' AND owner_id IS NULL").get();
  const a = S.createMeso(U(), { name: 'Calves A', weeks: 2, days: [{ label: 'A', slots: [{ exercise_id: calf.id, sets: 2, start: { weight: 100, reps: 12 } }] }] });
  const wa = S.workoutView(U(), S.mesoView(U(), a).days[0].workouts[0].id);
  logAll(wa, () => ({ weight: 100, reps: 12 }));
  S.workoutAction(U(), wa.id, { action: 'finish' });
  const b = S.createMeso(U(), { name: 'Calves B', weeks: 2, days: [{ label: 'B', slots: [{ exercise_id: calf.id, sets: 2, start: { weight: 100, reps: 12 } }] }] });
  const wb = S.workoutView(U(), S.mesoView(U(), b).days[0].workouts[0].id);
  assert.ok(wb.soreness.Calves, 'asks about calves');
  assert.equal(wb.soreness.Calves.answer, null);
  S.soreness(U(), wb.soreness.Calves.checkinId, 'on_time');
  assert.equal(S.workoutView(U(), wb.id).soreness.Calves.answer, 'on_time');
  // trend compares with the earlier meso's session at the same RIR
  const sb = S.workoutView(U(), wb.id).exercises[0].sets[0];
  S.updateSet(U(), sb.id, { weight: 100, reps: 14, done: true });
  assert.equal(S.workoutView(U(), wb.id).exercises[0].sets[0].trend, 'up');
});

test('find your weight: feeler sets go in as warm-ups, the result becomes the target', () => {
  const ext = ex('Leg Extension');
  const id = S.createMeso(U(), { name: 'Finder', weeks: 2, days: [{ label: 'A', slots: [{ exercise_id: ext.id, sets: 2, start: { weight: 100, reps: 12 } }] }] });
  const w = S.workoutView(U(), S.mesoView(U(), id).days[0].workouts[0].id);
  const x = w.exercises[0];
  S.wexAction(U(), x.id, { action: 'feeler', weight: 60, reps: 12 });
  S.wexAction(U(), x.id, { action: 'feeler', weight: 80, reps: 12 });
  S.wexAction(U(), x.id, { action: 'setTarget', weight: 90, reps: 12 });
  const v = S.workoutView(U(), w.id).exercises[0].sets;
  assert.deepEqual(v.map((s) => s.kind), ['warmup', 'warmup', 'regular', 'regular']);
  assert.deepEqual(v.slice(0, 2).map((s) => [s.weight, s.done]), [[60, 1], [80, 1]]);
  assert.deepEqual(v.slice(2).map((s) => [s.target_weight, s.target_reps, s.done]), [[90, 12, 0], [90, 12, 0]]);
});

test('trend compares with the same week and day of the previous meso, never earlier days of this one', () => {
  const lc = db.prepare("SELECT * FROM exercises WHERE muscle='Hamstrings' AND owner_id IS NULL ORDER BY id LIMIT 1").get();
  const mk = (name) => S.createMeso(U(), { name, weeks: 3, days: [0, 1].map((i) => ({ label: `D${i}`, slots: [{ exercise_id: lc.id, sets: 1, start: { weight: 100, reps: 10 } }] })) });
  const run = (id, d, reps) => {
    const w = S.workoutView(U(), S.mesoView(U(), id).days[d].workouts[0].id);
    const s = w.exercises[0].sets.find((q) => q.kind === 'regular');
    S.updateSet(U(), s.id, { weight: 100, reps, done: true });
    const out = S.workoutView(U(), w.id).exercises[0].sets.find((q) => q.id === s.id);
    S.workoutAction(U(), w.id, { action: 'finish', force: true });
    return out;
  };
  const a = mk('Ham A');
  assert.equal(run(a, 0, 10).trend, null, 'nothing earlier to compare with');
  assert.equal(run(a, 1, 8).trend, null, 'day 1 of the same meso does not count');
  const b = mk('Ham B');
  const b0 = run(b, 0, 10);
  assert.equal(b0.trend, 'flat', 'vs A week 1 day 1 (100x10)');
  assert.equal(b0.on_target, true, 'hit the 10-rep target');
  const b1 = run(b, 1, 9);
  assert.equal(b1.trend, 'up', 'vs A week 1 day 2 (100x8), not B day 1 (100x10)');
});

test('on-target check follows a changed weight', () => {
  const lc = db.prepare("SELECT * FROM exercises WHERE muscle='Glutes' AND owner_id IS NULL ORDER BY id LIMIT 1").get();
  const id = S.createMeso(U(), { name: 'Tgt', weeks: 3, days: [{ label: 'A', slots: [{ exercise_id: lc.id, sets: 2, start: { weight: 100, reps: 10 } }] }] });
  const w = S.workoutView(U(), S.mesoView(U(), id).days[0].workouts[0].id);
  const [s1, s2] = w.exercises[0].sets.filter((q) => q.kind === 'regular');
  S.updateSet(U(), s1.id, { weight: s1.target_weight, reps: s1.target_reps - 1, done: true });
  S.updateSet(U(), s2.id, { weight: s2.target_weight, reps: s2.target_reps, done: true });
  const v = S.workoutView(U(), w.id).exercises[0].sets.filter((q) => q.kind === 'regular');
  assert.equal(v[0].on_target, false);
  assert.equal(v[1].on_target, true);
});
