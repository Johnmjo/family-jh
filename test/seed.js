'use strict';
// Demo data for local testing: a finished meso with history and a current meso part way through.
// Usage: DATA_DIR=./data-local node test/seed.js [email]
const { db } = require('../server/db');
const S = require('../server/store');
const { ensureMember } = require('../server/auth');
const email = process.argv[2] || process.env.DEV_USER_EMAIL || 'you@example.com';
const u0 = ensureMember(email);
const U = () => db.prepare('SELECT * FROM users WHERE id=?').get(u0.id);
const ex = (n) => db.prepare('SELECT id FROM exercises WHERE name=? AND owner_id IS NULL').get(n).id;
S.addBodyweight(U(), { weight: 223 });
const DAY = 864e5; let clock = Date.now() - 60 * DAY;
const realNow = Date.now; Date.now = () => clock;
const days = [
  { label: 'Push', weekday: 1, slots: [[ 'Bench Press (Medium Grip)', 3, 175, 9 ], ['Dumbbell Press (Low Incline)', 2, 60, 10], ['Cable Triceps Pushdown (Bar)', 2, 50, 12], ['Dumbbell Lateral Raise', 3, 20, 14]] },
  { label: 'Pull', weekday: 2, slots: [['Pulldown (Normal Grip)', 3, 150, 10], ['Chest Supported Row', 2, 90, 10], ['EZ Bar Preacher Curl', 2, 60, 10], ['Assisted Pullup (Normal Grip)', 2, 60, 8]] },
  { label: 'Legs', weekday: 4, slots: [['Barbell Squat (High Bar)', 3, 225, 8], ['Leg Press', 2, 360, 12], ['Seated Leg Curl', 2, 110, 12], ['Smith Machine Calves', 2, 135, 12]] },
];
const mk = (name) => S.createMeso(U(), { name, weeks: 4, priorities: { Chest: 'emphasize', Triceps: 'emphasize' },
  days: days.map((d) => ({ label: d.label, weekday: d.weekday, slots: d.slots.map(([n, sets, w, r]) => ({ exercise_id: ex(n), sets, start: { weight: w, reps: r } })) })) });
function runWorkout(wid, repsDrop = 0) {
  const w = S.workoutView(U(), wid);
  for (const x of w.exercises) {
    for (const s of x.sets) {
      clock += 150 * 1000;
      const reps = Math.max(1, (s.target_reps || 10) - repsDrop - (s.pos > 1 ? 1 : 0));
      S.updateSet(U(), s.id, { weight: s.target_weight, reps, done: true });
    }
    if (!w.isDeload) S.checkin(U(), wid, { muscle: x.muscle, pump: ['low', 'good', 'great'][x.id % 3], workload: ['easy', 'right', 'right'][x.id % 3], joints: 'fine' });
  }
  S.workoutAction(U(), wid, { action: 'finish', force: true });
}
const m1 = mk('Chest and tri 10-2026');
let v = S.mesoView(U(), m1);
for (let wk = 1; wk <= 4; wk++) for (const d of v.days) { clock += 2 * DAY; runWorkout(d.workouts[wk - 1].id); }
clock = realNow() - 9 * DAY;
const m2 = mk('Chest and tri 11-2026');
v = S.mesoView(U(), m2);
for (const d of v.days) { clock += 2 * DAY; runWorkout(d.workouts[0].id); }
// part of today's workout
Date.now = realNow;
clock = realNow() - 6 * 60 * 1000;
Date.now = () => clock;
const next = S.mesoView(U(), m2).nextId;
const w = S.workoutView(U(), next);
const x = w.exercises[0];
S.updateSet(U(), x.sets[0].id, { weight: x.sets[0].target_weight, reps: x.sets[0].target_reps + 1, done: true });
clock = realNow() - 134 * 1000;
S.updateSet(U(), x.sets[1].id, { weight: x.sets[1].target_weight, reps: x.sets[1].target_reps, done: true });
Date.now = realNow;
console.log(`Seeded ${email}: 2 mesos, current workout ${next}`);
