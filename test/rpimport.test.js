'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os'); const fs = require('fs'); const path = require('path');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'jh-rp-'));
const { db } = require('../server/db');
const S = require('../server/store');
const R = require('../server/rpimport');
const { ensureMember } = require('../server/auth');

const set = (weight, reps, status = 'complete', extra = {}) => ({ setType: 'regular', weight, reps, weightTarget: weight, repsTarget: reps, status, finishedAt: status === 'complete' ? '2026-10-01T12:00:00Z' : null, position: 0, ...extra });
const day = (status, exercises, groups = []) => ({ position: 0, label: 'Monday', status, finishedAt: status === 'complete' ? '2026-10-01T13:00:00Z' : null, bodyweight: 200, bodyweightAt: '2026-10-01T12:00:00Z', exercises, muscleGroups: groups });
const ex = (name, sets) => ({ name, position: 0, jointPain: 0, muscleGroupId: 1, sets: sets.map((s, i) => ({ ...s, position: i })) });
const meso = (id, name, finished, weeks) => ({ id, name, unit: 'lb', microRirs: 2108, createdAt: '2026-09-01T00:00:00Z', finishedAt: finished ? '2026-10-20T00:00:00Z' : null, deletedAt: null, priorities: { 1: { muscleGroupId: 1, mgPriorityType: 'emphasize' } }, weeks });

test('RP import: history, current meso, bodyweight lifts, idempotent', () => {
  const u = ensureMember('rp@example.com'); const U = () => db.prepare('SELECT * FROM users WHERE id=?').get(u.id);
  const pending = { days: [day('pending', [])] };
  const data = [
    meso(1, 'Old', true, [{ days: [day('complete', [ex('Bench Press (Medium Grip)', [set(185, 8), set(185, 7), set(185, 0, 'skipped')]), ex('Assisted Pullup (Normal Grip)', [set(190, 7, 'complete', { bodyweight: 210 })]), ex('Pullup (Normal Grip)', [set(210, 5, 'complete', { bodyweight: 210 })])], [{ muscleGroupId: 1, pump: 0, workload: 1, soreness: -1 }])] }, pending, pending, pending]),
    meso(2, 'Now', false, [{ days: [day('complete', [ex('Bench Press (Medium Grip)', [set(190, 8), set(190, 8)])], [{ muscleGroupId: 1, pump: 2, workload: 3, soreness: -1 }])] }, pending, pending, pending]),
  ];
  const p = R.preview(U(), data);
  assert.equal(p.mesos, 2); assert.equal(p.sets, 6); assert.equal(p.continueMeso, 'Now');
  R.run(U(), data);
  const cur = S.currentMeso(U()); assert.equal(cur.name, 'Now');
  const v = S.mesoView(U(), cur.id); assert.deepEqual(v.rirs, [2, 1, 0, 8]); assert.equal(v.priorities.Chest, 'emphasize');
  // week 2 is built by JH from the imported week 1
  const w2 = S.workoutView(U(), v.days[0].workouts[1].id);
  assert.deepEqual([w2.exercises[0].sets[0].target_weight, w2.exercises[0].sets[0].target_reps], [190, 9]); // 194.75 isn't loadable, so +1 rep
  const old = db.prepare("SELECT id FROM mesos WHERE name='Old'").get();
  const w1 = S.workoutView(U(), S.mesoView(U(), old.id).days[0].workouts[0].id);
  const byName = Object.fromEntries(w1.exercises.map((x) => [x.exercise.name, x.sets]));
  assert.equal(byName['Assisted Pullup (Normal Grip)'][0].weight, 20, 'assistance = bodyweight - load');
  assert.equal(byName['Pullup (Normal Grip)'][0].weight, null);
  assert.equal(byName['Bench Press (Medium Grip)'][2].skipped, 1);
  assert.equal(db.prepare("SELECT pump FROM checkins c JOIN workouts w ON w.id=c.workout_id WHERE w.meso_id=?").get(old.id).pump, 'low');
  // again: nothing new
  assert.equal(R.preview(U(), data).mesos, 0);
  // someone else sees none of it
  const k = ensureMember('other@example.com');
  assert.equal(S.mesoList(k).length, 0);
  assert.throws(() => R.preview(U(), { nope: 1 }), /RP export/);
});
