'use strict';
// Everything a person does in JH. Every query is scoped to the signed-in user, so nobody can see
// or change anyone else's training.
const fs = require('fs');
const path = require('path');
const { db } = require('./db');
const E = require('./engine');
const H = require('./howto');

class Bad extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }
const now = () => Date.now();
const J = (s, d) => { try { return s == null ? d : JSON.parse(s); } catch { return d; } };
const num = (v) => (v === '' || v == null || !isFinite(Number(v)) ? null : Number(v));
const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const MUSCLES = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Abs', 'Traps', 'Forearms'];
const EQUIPMENT = ['Barbell', 'Dumbbell', 'Cable', 'Machine', 'Smith machine', 'Freemotion', 'Bodyweight only', 'Bodyweight + added weight', 'Machine assisted'];
const PRIORITIES = ['emphasize', 'grow', 'maintain'];
const WORKING = "('regular','myo','myomatch')";

// ---------- settings ----------
function defaultSettings(units = 'lb') {
  return {
    ...E.DEFAULT_SETTINGS[units], theme: 'dark', autoMatch: true, preferredEquipment: EQUIPMENT.slice(), filterPreferred: true,
    restCompound: 180, restIsolation: 120, chime: true, ramp: E.DEFAULT_RAMP.map((r) => ({ ...r })), suggestions: true, roughGuesses: true,
    setCap: 8, startSets: 2,
  };
}
function settingsOf(user) { const s = J(user.settings, {}); return { ...defaultSettings(s.units === 'kg' ? 'kg' : 'lb'), ...s }; }
function updateSettings(user, body) {
  const cur = settingsOf(user);
  const b = body || {};
  let next = { ...cur };
  if (b.units && b.units !== cur.units && ['lb', 'kg'].includes(b.units)) next = { ...next, ...E.DEFAULT_SETTINGS[b.units] };
  const nums = ['barWeight', 'smithBar', 'dumbbellStep', 'cableStep', 'machineStep', 'addedStep', 'assistStep', 'minJump', 'restCompound', 'restIsolation', 'setCap', 'startSets'];
  for (const k of nums) if (b[k] !== undefined) { const v = num(b[k]); if (v == null || v < 0 || v > 2000) throw new Bad(`Check ${k}`); next[k] = v; }
  for (const k of ['autoMatch', 'chime', 'suggestions', 'roughGuesses', 'filterPreferred']) if (b[k] !== undefined) next[k] = !!b[k];
  if (b.theme) next.theme = b.theme === 'light' ? 'light' : 'dark';
  if (Array.isArray(b.plates)) {
    const p = b.plates.map(num).filter((x) => x > 0 && x <= 100);
    if (!p.length) throw new Bad('Add at least one plate size');
    // merge duplicate sizes, keeping each size's pair count with it (empty = plenty)
    const raw = b.plates.map(num);
    const cnt = Array.isArray(b.plateCounts) ? b.plateCounts : [];
    const merged = new Map();
    raw.forEach((w, i) => {
      if (!(w > 0 && w <= 100)) return;
      const c = cnt[i] === '' || cnt[i] == null ? null : Math.max(0, Math.floor(Number(cnt[i])));
      if (!merged.has(w)) merged.set(w, c);
      else { const o = merged.get(w); merged.set(w, o == null || c == null ? null : o + c); }
    });
    next.plates = [...merged.keys()].sort((a, c) => c - a);
    next.plateCounts = next.plates.map((w) => merged.get(w));
    if (next.plateCounts.every((c) => c == null)) next.plateCounts = null;
  } else if (Array.isArray(b.plateCounts)) {
    next.plateCounts = b.plateCounts.map((c) => (c === '' || c == null ? null : Math.max(0, Math.floor(Number(c)))));
  }
  if (Array.isArray(b.preferredEquipment)) next.preferredEquipment = b.preferredEquipment.filter((e) => EQUIPMENT.includes(e));
  if (Array.isArray(b.ramp)) {
    const r = b.ramp.map((x) => ({ pct: num(x.pct), reps: Math.max(1, Math.floor(num(x.reps) || 1)), rest: Math.max(0, Math.floor(num(x.rest) || 0)), optional: !!x.optional }))
      .filter((x) => x.pct > 0 && x.pct < 100).sort((a, c) => a.pct - c.pct);
    next.ramp = r;
  }
  if (b.name !== undefined) { const n = str(b.name, 40); if (n) db.prepare('UPDATE users SET name=? WHERE id=?').run(n, user.id); }
  if (b.units) next.units = b.units === 'kg' ? 'kg' : 'lb';
  db.prepare('UPDATE users SET settings=? WHERE id=?').run(JSON.stringify(next), user.id);
  return next;
}

// ---------- exercises ----------
const exStmt = db.prepare('SELECT * FROM exercises WHERE id=? AND (owner_id IS NULL OR owner_id=?)');
function exercise(user, id) {
  const e = exStmt.get(id, user.id);
  if (!e) throw new Bad('Exercise not found', 404);
  return e;
}
function isCompound(e) {
  return ['Barbell', 'Smith machine'].includes(e.equipment) || ['bench', 'smith_press', 'db_press', 'machine_chest', 'dip', 'pulldown', 'pullup', 'row_bb', 'row_db', 'row_machine', 'ohp', 'squat', 'leg_press', 'split_squat', 'deadlift', 'rdl', 'good_morning', 'hip_thrust', 'close_grip'].includes(e.family);
}
function defaultRest(user, e) { const s = settingsOf(user); return isCompound(e) ? s.restCompound : s.restIsolation; }
function howToOf(e) {
  if (e.owner_id) return J(e.howto, { setup: [], steps: [], cues: [], mistakes: [], muscles: [e.muscle] });
  return H.howTo(e.name, e.equipment, e.muscle);
}
function listExercises(user) {
  const done = new Set(db.prepare(`SELECT DISTINCT x.exercise_id id FROM wex x JOIN workouts w ON w.id=x.workout_id JOIN mesos m ON m.id=w.meso_id
    JOIN sets s ON s.wex_id=x.id WHERE m.user_id=? AND s.done=1`).all(user.id).map((r) => r.id));
  return db.prepare('SELECT id, owner_id, name, muscle, equipment, family, ratio, link FROM exercises WHERE owner_id IS NULL OR owner_id=? ORDER BY name')
    .all(user.id).map((e) => ({ ...e, custom: !!e.owner_id, done: done.has(e.id) }));
}
function createExercise(user, b) {
  const name = str(b.name, 80);
  if (!name) throw new Bad('Give the exercise a name');
  const muscle = MUSCLES.includes(b.muscle) ? b.muscle : null; if (!muscle) throw new Bad('Pick a muscle group');
  const equipment = EQUIPMENT.includes(b.equipment) ? b.equipment : null; if (!equipment) throw new Bad('Pick the equipment');
  const family = H.FAMILIES.some((f) => f.id === b.family) ? b.family : null;
  const ratio = family ? (num(b.ratio) > 0 && num(b.ratio) < 5 ? num(b.ratio) : 1) : null;
  const howto = {
    setup: lines(b.setup), steps: lines(b.steps), cues: lines(b.cues), mistakes: lines(b.mistakes), muscles: [muscle],
  };
  const info = db.prepare('INSERT INTO exercises(owner_id,name,muscle,equipment,family,ratio,howto,link,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(user.id, name, muscle, equipment, family, ratio, JSON.stringify(howto), safeLink(b.link), now());
  return Number(info.lastInsertRowid);
}
function updateExercise(user, id, b) {
  const e = exercise(user, id);
  if (e.owner_id !== user.id) throw new Bad('Built-in exercises can\'t be edited. Add a pinned note instead.', 403);
  const cur = howToOf(e);
  const howto = {
    setup: b.setup !== undefined ? lines(b.setup) : cur.setup, steps: b.steps !== undefined ? lines(b.steps) : cur.steps,
    cues: b.cues !== undefined ? lines(b.cues) : cur.cues, mistakes: b.mistakes !== undefined ? lines(b.mistakes) : cur.mistakes, muscles: [b.muscle || e.muscle],
  };
  const family = b.family !== undefined ? (H.FAMILIES.some((f) => f.id === b.family) ? b.family : null) : e.family;
  db.prepare('UPDATE exercises SET name=?, muscle=?, equipment=?, family=?, ratio=?, howto=?, link=? WHERE id=?').run(
    str(b.name ?? e.name, 80) || e.name, MUSCLES.includes(b.muscle) ? b.muscle : e.muscle, EQUIPMENT.includes(b.equipment) ? b.equipment : e.equipment,
    family, family ? (num(b.ratio) > 0 ? num(b.ratio) : e.ratio || 1) : null, JSON.stringify(howto), b.link !== undefined ? safeLink(b.link) : e.link, id);
}
function deleteExercise(user, id) {
  const e = exercise(user, id);
  if (e.owner_id !== user.id) throw new Bad('Built-in exercises can\'t be deleted', 403);
  const used = db.prepare('SELECT COUNT(*) n FROM wex WHERE exercise_id=?').get(id).n;
  if (used) throw new Bad('This exercise is in your training history, so it can\'t be deleted');
  db.prepare('DELETE FROM exercises WHERE id=?').run(id);
}
const lines = (v) => (Array.isArray(v) ? v : String(v || '').split('\n')).map((s) => str(s, 300)).filter(Boolean).slice(0, 12);
function safeLink(v) { const s = str(v, 400); return /^https?:\/\//i.test(s) ? s : ''; }

// ---------- history ----------
// Working sets of one exercise, newest session first: [{ date, workoutId, sets:[{weight,reps,rir}] }]
function sessionsFor(user, exerciseId, { beforeWorkout = null, limit = 12 } = {}) {
  const rows = db.prepare(`SELECT s.weight, s.reps, s.logged_at, w.id wid, w.week, m.rirs, w.bodyweight, s.pos, s.kind
    FROM sets s JOIN wex x ON x.id=s.wex_id JOIN workouts w ON w.id=x.workout_id JOIN mesos m ON m.id=w.meso_id
    WHERE m.user_id=? AND x.exercise_id=? AND s.done=1 AND s.kind IN ${WORKING} AND s.reps>0 ${beforeWorkout ? 'AND w.id<>?' : ''}
    ORDER BY s.logged_at DESC`).all(...[user.id, exerciseId, ...(beforeWorkout ? [beforeWorkout] : [])]);
  const by = new Map();
  for (const r of rows) {
    if (!by.has(r.wid)) {
      if (by.size >= limit) break;
      const rirs = J(r.rirs, []);
      by.set(r.wid, { workoutId: r.wid, date: r.logged_at, rir: Math.min(rirs[r.week - 1] ?? 2, 4), bodyweight: r.bodyweight, sets: [] });
    }
    const s = by.get(r.wid);
    s.sets.push({ weight: r.weight, reps: r.reps, rir: s.rir, pos: r.pos, kind: r.kind });
  }
  for (const s of by.values()) s.sets.sort((a, b) => a.pos - b.pos);
  return [...by.values()];
}
function latestBodyweight(user) {
  const r = db.prepare('SELECT weight FROM bodyweights WHERE user_id=? ORDER BY at DESC LIMIT 1').get(user.id);
  return r ? r.weight : null;
}

// Suggested starting weight for an exercise: from your own history, else from a similar exercise.
function suggestFor(user, e, { reps = null, rir = 2, excludeWorkout = null } = {}) {
  const s = settingsOf(user);
  if (!s.suggestions) return null;
  const model = E.loadModel(e.equipment, s);
  const bw = latestBodyweight(user);
  const sessions = sessionsFor(user, e.id, { beforeWorkout: excludeWorkout });
  if (sessions.length) {
    const g = E.suggestFromHistory(sessions, { reps, rir, model, bodyweight: bw, now: now() });
    if (g && (g.weight != null || model.kind === 'none')) {
      const days = Math.round((now() - g.basis.date) / 864e5);
      return { ...g, label: 'From your history', text: `Based on ${fmtSet(g.basis, s.units, e)} ${ago(days)}${g.ageNote ? `, ${g.ageNote}` : ''}.` };
    }
  }
  if (!e.family || !s.roughGuesses) return null;
  // Similar exercises you have done, best confidence first
  const fam = db.prepare('SELECT * FROM exercises WHERE family=? AND id<>? AND (owner_id IS NULL OR owner_id=?)').all(e.family, e.id, user.id);
  let best = null;
  for (const o of fam) {
    const ss = sessionsFor(user, o.id, { limit: 3 });
    if (!ss.length) continue;
    const om = E.loadModel(o.equipment, s);
    const hm = E.historyMax(ss, om, bw);
    if (!hm) continue;
    const cross = o.equipment !== e.equipment;
    const personal = personalRatio(user, e, o, s, bw);
    const ratio = personal || (e.ratio || 1) / (o.ratio || 1);
    const age = E.ageFactor(hm.sessions[0].date, now());
    const g = E.suggestFromSimilar({ e1rm: hm.e1rm * age.factor }, ratio, { reps: reps || 10, rir, model, bodyweight: bw, personal: !!personal, crossEquipment: cross });
    if (!g) continue;
    const rank = { personal: 3, rough: 2, hint: 1 }[g.confidence];
    if (!best || rank > best.rank) {
      const top = hm.sessions[0].top;
      best = {
        ...g, rank, from: o.name,
        label: g.confidence === 'personal' ? 'Based on your history' : g.confidence === 'rough' ? 'Rough guess' : 'Hint only',
        text: `${g.confidence === 'hint' ? 'Very rough' : 'Rough'} guess from your ${o.name} (${fmtSet(top, s.units, o)} ${ago(Math.round((now() - hm.sessions[0].date) / 864e5))}), since this usually runs about ${Math.round(ratio * 100)}% of it. Start light and adjust.`,
      };
    }
  }
  if (best) delete best.rank;
  return best;
}
// Your own ratio between two exercises, once you've logged both within 8 weeks of each other
function personalRatio(user, target, source, s, bw) {
  const a = sessionsFor(user, target.id, { limit: 3 }); const b = sessionsFor(user, source.id, { limit: 3 });
  if (!a.length || !b.length) return null;
  if (Math.abs(a[0].date - b[0].date) > 56 * 864e5) return null;
  const ha = E.historyMax(a, E.loadModel(target.equipment, s), bw); const hb = E.historyMax(b, E.loadModel(source.equipment, s), bw);
  return ha && hb ? ha.e1rm / hb.e1rm : null;
}
const ago = (d) => (d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 14 ? `${d} days ago` : d < 63 ? `${Math.round(d / 7)} weeks ago` : `${Math.round(d / 30)} months ago`);
function fmtSet(st, units, e) {
  if (!st) return '';
  if (e && e.equipment === 'Bodyweight only') return `${st.reps} reps`;
  return st.weight == null ? `${st.reps} reps` : `${st.weight} ${units} × ${st.reps}`;
}

// ---------- mesos ----------
function mesoOf(user, id) {
  const m = db.prepare('SELECT * FROM mesos WHERE id=? AND user_id=?').get(id, user.id);
  if (!m) throw new Bad('Meso not found', 404);
  return m;
}
function workoutOf(user, id) {
  const w = db.prepare('SELECT w.*, m.user_id FROM workouts w JOIN mesos m ON m.id=w.meso_id WHERE w.id=?').get(id);
  if (!w || w.user_id !== user.id) throw new Bad('Workout not found', 404);
  return w;
}
function wexOf(user, id) {
  const x = db.prepare('SELECT x.*, w.meso_id, w.week, w.status wstatus, m.user_id FROM wex x JOIN workouts w ON w.id=x.workout_id JOIN mesos m ON m.id=w.meso_id WHERE x.id=?').get(id);
  if (!x || x.user_id !== user.id) throw new Bad('Exercise not found', 404);
  return x;
}
function setOf(user, id) {
  const s = db.prepare(`SELECT s.*, x.workout_id, x.exercise_id, x.muscle, w.meso_id, w.week, w.status wstatus, m.user_id FROM sets s JOIN wex x ON x.id=s.wex_id
    JOIN workouts w ON w.id=x.workout_id JOIN mesos m ON m.id=w.meso_id WHERE s.id=?`).get(id);
  if (!s || s.user_id !== user.id) throw new Bad('Set not found', 404);
  return s;
}
function orderedWorkouts(mesoId) {
  return db.prepare('SELECT w.*, d.pos dpos FROM workouts w JOIN meso_days d ON d.id=w.day_id WHERE w.meso_id=? ORDER BY w.week, d.pos').all(mesoId);
}
function isUnlocked(w) {
  const list = orderedWorkouts(w.meso_id);
  for (const o of list) { if (o.id === w.id) return true; if (o.status === 'pending') return false; }
  return false;
}

/*
 * Create a meso. body: { name, weeks, deload, priorities:{muscle:priority}, days:[{ label, weekday,
 *   slots:[{ exercise_id, muscle, sets, start:{weight,reps} }] }], source }
 */
function createMeso(user, b) {
  const name = str(b.name, 60) || 'New meso';
  const weeks = Math.round(num(b.weeks) || 4);
  if (weeks < 2 || weeks > 8) throw new Bad('A meso is 2 to 8 weeks');
  const deload = b.deload === undefined ? true : !!b.deload;
  const days = Array.isArray(b.days) ? b.days.slice(0, 7) : [];
  if (!days.length) throw new Bad('Add at least one day');
  const s = settingsOf(user);
  for (const d of days) {
    if (!Array.isArray(d.slots) || !d.slots.length) throw new Bad(`Add an exercise to ${d.label || 'each day'}`);
    for (const sl of d.slots) {
      if (!sl.exercise_id) throw new Bad(`Pick an exercise for every ${sl.muscle || 'muscle'} slot (or use Autofill)`);
      exercise(user, sl.exercise_id);
    }
  }
  const priorities = {};
  for (const [k, v] of Object.entries(b.priorities || {})) if (MUSCLES.includes(k) && PRIORITIES.includes(v)) priorities[k] = v;
  const rirs = E.rirSchedule(weeks, deload);
  return db.transaction(() => {
    db.prepare('UPDATE mesos SET is_current=0 WHERE user_id=?').run(user.id);
    const mid = Number(db.prepare('INSERT INTO mesos(user_id,name,weeks,deload,rirs,priorities,is_current,source,created_at) VALUES(?,?,?,?,?,?,1,?,?)')
      .run(user.id, name, weeks, deload ? 1 : 0, JSON.stringify(rirs), JSON.stringify(priorities), b.source ? JSON.stringify(b.source) : null, now()).lastInsertRowid);
    days.forEach((d, i) => {
      const did = Number(db.prepare('INSERT INTO meso_days(meso_id,pos,label,weekday) VALUES(?,?,?,?)').run(mid, i, str(d.label, 40) || `Day ${i + 1}`, d.weekday == null || d.weekday === '' ? null : Number(d.weekday) % 7).lastInsertRowid);
      for (let w = 1; w <= weeks; w++) {
        const wid = Number(db.prepare('INSERT INTO workouts(meso_id,day_id,week,label) VALUES(?,?,?,?)').run(mid, did, w, str(d.label, 40) || `Day ${i + 1}`).lastInsertRowid);
        if (w === 1) {
          d.slots.forEach((sl, k) => {
            const e = exercise(user, sl.exercise_id);
            const sets = Math.max(1, Math.min(6, Math.round(num(sl.sets) || s.startSets || 2)));
            addWex(user, wid, k, e, sl.muscle && MUSCLES.includes(sl.muscle) ? sl.muscle : e.muscle, sets, rirs[0], sl.start || null, num(sl.rest_goal));
          });
          db.prepare('UPDATE workouts SET generated=1 WHERE id=?').run(wid);
        }
      }
    });
    return mid;
  })();
}
// Add an exercise to a workout with its first-time targets (start = given weights, else a suggestion)
function addWex(user, workoutId, pos, e, muscle, sets, rir, start, restGoal) {
  const s = settingsOf(user);
  const model = E.loadModel(e.equipment, s);
  let sug = null; let weight = null; let reps = null;
  if (start && (start.weight != null || start.reps != null)) {
    weight = num(start.weight); reps = num(start.reps);
    sug = { label: start.label || 'Carried over', text: start.text || '' };
  } else {
    sug = suggestFor(user, e, { rir });
    if (sug && sug.confidence !== 'hint') { weight = sug.weight; reps = sug.reps; }
  }
  if (model.kind === 'none') weight = null;
  const xid = Number(db.prepare('INSERT INTO wex(workout_id,pos,exercise_id,muscle,start_sets,rest_goal,suggestion,why) VALUES(?,?,?,?,?,?,?,?)')
    .run(workoutId, pos, e.id, muscle, sets, restGoal || null, sug ? JSON.stringify(cleanSug(sug)) : null, null).lastInsertRowid);
  const range = weight != null ? E.targetRange(weight, model) : null;
  const ins = db.prepare('INSERT INTO sets(wex_id,pos,kind,target_weight,target_reps,range_low,range_high) VALUES(?,?,?,?,?,?,?)');
  for (let i = 0; i < sets; i++) ins.run(xid, i, 'regular', weight, reps, range ? range[0] : null, range ? range[1] : null);
  return xid;
}
const cleanSug = (g) => ({ label: g.label, text: g.text, confidence: g.confidence, weight: g.weight, reps: g.reps, from: g.from, stale: !!g.ageNote });

// When a finished workout changes, next week's copy of that day may already be built from the old
// numbers. If nothing in it has been logged yet, throw it away so it is rebuilt on open.
function refreshNext(w) {
  const nx = db.prepare("SELECT * FROM workouts WHERE meso_id=? AND day_id=? AND week=? AND generated=1 AND status='pending' AND started_at IS NULL").get(w.meso_id, w.day_id, w.week + 1);
  if (!nx) return;
  const touched = db.prepare('SELECT COUNT(*) n FROM sets s JOIN wex x ON x.id=s.wex_id WHERE x.workout_id=? AND (s.done=1 OR s.skipped=1)').get(nx.id).n
    + db.prepare('SELECT COUNT(*) n FROM checkins WHERE workout_id=?').get(nx.id).n;
  if (touched) return;
  db.prepare('DELETE FROM wex WHERE workout_id=?').run(nx.id);
  db.prepare('UPDATE workouts SET generated=0 WHERE id=?').run(nx.id);
}

// Build a later week's workout from the same day last week: sets from the check-ins, targets from
// what you actually did. Runs when the workout first unlocks, so late soreness answers count.
function generate(user, w) {
  if (w.generated || w.week === 1) return;
  const m = mesoOf(user, w.meso_id);
  const prev = db.prepare('SELECT * FROM workouts WHERE meso_id=? AND day_id=? AND week=?').get(w.meso_id, w.day_id, w.week - 1);
  if (!prev) return;
  if (!prev.generated) generate(user, prev);
  const s = settingsOf(user);
  const rirs = J(m.rirs, []);
  const isDeload = !!m.deload && w.week === m.weeks;
  const priorities = J(m.priorities, {});
  const pwex = db.prepare('SELECT * FROM wex WHERE workout_id=? AND removed=0 ORDER BY pos').all(prev.id);
  const checks = Object.fromEntries(db.prepare('SELECT * FROM checkins WHERE workout_id=?').all(prev.id).map((c) => [c.muscle, c]));
  // working set counts per exercise, then the muscle's change
  const plan = pwex.map((x) => {
    const sets = db.prepare(`SELECT * FROM sets WHERE wex_id=? ORDER BY pos`).all(x.id);
    const work = sets.filter((t) => t.kind !== 'warmup');
    const regular = work.filter((t) => t.kind !== 'attempt').length;
    const tested = work.some((t) => t.kind === 'attempt') ? 1 : 0; // a 1RM test stood in for one set
    return { x, work, count: Math.max(1, regular + tested) };
  });
  const byMuscle = {};
  plan.forEach((p, i) => { (byMuscle[p.x.muscle] = byMuscle[p.x.muscle] || []).push(i); });
  const why = {};
  if (!isDeload) {
    for (const [mus, idx] of Object.entries(byMuscle)) {
      const c = checks[mus];
      if (!c) { why[mus] = 'Same sets: no check-in last week'; continue; }
      const d = E.setsDelta({ pump: c.pump, workload: c.workload, priority: priorities[mus] || 'grow', soreness: c.soreness });
      const counts = E.applySetsDelta(idx.map((i) => plan[i].count), d.delta, s.setCap);
      idx.forEach((i, k) => { plan[i].count = counts[k]; });
      why[mus] = d.why;
    }
  }
  db.transaction(() => {
    plan.forEach((p, pos) => {
      const exId = p.x.orig_exercise_id || p.x.exercise_id; // a this-day-only swap goes back
      const e = exercise(user, exId);
      const model = E.loadModel(e.equipment, s);
      const sameEx = exId === p.x.exercise_id;
      const count = isDeload ? Math.min(2, p.count) : p.count;
      const xid = Number(db.prepare('INSERT INTO wex(workout_id,pos,exercise_id,muscle,start_sets,rest_goal,why,plan_1rm) VALUES(?,?,?,?,?,?,?,?)')
        .run(w.id, pos, exId, p.x.muscle, p.x.start_sets, p.x.rest_goal, isDeload ? 'Deload: 2 easy sets, about 90% weight' : why[p.x.muscle] || null, 0).lastInsertRowid);
      // the working sets from last week, the attempt of a 1RM test counting as the set it replaced
      const src = sameEx ? p.work.filter((t) => t.kind !== 'attempt' || t === p.work.find((a) => a.kind === 'attempt')) : [];
      let first = null;
      if (!src.length) {
        const sug = suggestFor(user, e, { rir: rirs[w.week - 1] ?? 2, excludeWorkout: w.id });
        if (sug && sug.confidence !== 'hint') first = { weight: sug.weight, reps: sug.reps };
        db.prepare('UPDATE wex SET suggestion=? WHERE id=?').run(sug ? JSON.stringify(cleanSug(sug)) : null, xid);
      }
      for (let i = 0; i < count; i++) {
        const t = src[i];
        let tw = null; let tr = null; let kind = 'regular';
        if (t) {
          kind = ['myo', 'myomatch'].includes(t.kind) ? t.kind : 'regular';
          const did = t.done && t.reps > 0 && !t.skipped && t.kind !== 'attempt' ? { weight: t.weight, reps: t.reps } : null;
          if (isDeload) {
            const base = did || (t.target_reps ? { weight: t.target_weight, reps: t.target_reps } : null);
            const d = base ? E.deloadTarget(base, model) : null;
            tw = d ? d.weight : t.target_weight; tr = d ? d.reps : null;
          } else if (did) {
            const n = E.nextTarget(did, model); tw = n.weight; tr = n.reps;
          } else if (t.kind === 'attempt') {
            const ref = p.work.find((a) => a.kind !== 'attempt' && a.done) || null;
            tw = ref ? ref.weight : t.target_weight; tr = ref ? ref.reps : null;
          } else { tw = t.target_weight; tr = t.target_reps; }
        } else if (src.length) {
          // an added set: same weight as the set before, effort target only
          const last = src[src.length - 1];
          tw = last.done && last.weight != null ? E.nextTarget({ weight: last.weight, reps: last.reps || 1 }, model).weight : last.target_weight; tr = null;
        } else if (first) { tw = first.weight; tr = first.reps; }
        if (model.kind === 'none') tw = null;
        const range = tw != null ? E.targetRange(tw, model) : null;
        db.prepare('INSERT INTO sets(wex_id,pos,kind,target_weight,target_reps,range_low,range_high) VALUES(?,?,?,?,?,?,?)')
          .run(xid, i, kind, tw, tr, range ? range[0] : null, range ? range[1] : null);
      }
      // joint pain carries a swap hint
      if (p.x.joint_pain === 'painful') db.prepare('UPDATE wex SET joint_pain=? WHERE id=?').run('flagged', xid);
    });
    db.prepare('UPDATE workouts SET generated=1, label=? WHERE id=?').run(prev.label, w.id);
  })();
}

// ---------- workout view ----------
// The sets to compare a workout's exercise with: the same week (deload with deload) and the same
// day of the latest earlier meso that has it, else another day of that week, else an older meso.
// Earlier days of the current meso never count: they share this week's target, so they can't show overload.
function trendBaseline(user, m, w, exerciseId) {
  const day = db.prepare('SELECT pos FROM meso_days WHERE id=?').get(w.day_id);
  const pos = day ? day.pos : 0;
  const deload = !!m.deload && w.week === m.weeks;
  const weekCond = deload ? 'pm.deload=1 AND pw.week=pm.weeks' : 'pw.week=? AND NOT (pm.deload=1 AND pw.week=pm.weeks)';
  const args = [user.id, m.id, exerciseId, ...(deload ? [] : [w.week]), pos, pos];
  // "latest" = most recently started, by its first logged set (imported mesos keep RP's creation date,
  // which can be out of order; the last logged set moves when an old set is edited later)
  const hit = db.prepare(`SELECT x.id xid,
      COALESCE((SELECT MIN(s2.logged_at) FROM sets s2 JOIN wex x2 ON x2.id=s2.wex_id JOIN workouts w2 ON w2.id=x2.workout_id
        WHERE w2.meso_id=pm.id AND s2.done=1), pm.created_at) trained
    FROM wex x JOIN workouts pw ON pw.id=x.workout_id JOIN mesos pm ON pm.id=pw.meso_id
    JOIN meso_days d ON d.id=pw.day_id
    WHERE pm.user_id=? AND pm.id<>? AND x.exercise_id=? AND x.removed=0 AND ${weekCond}
      AND EXISTS (SELECT 1 FROM sets s WHERE s.wex_id=x.id AND s.done=1 AND s.kind IN ${WORKING} AND s.reps>0)
    ORDER BY trained DESC, pm.id DESC, (d.pos=?) DESC, ABS(d.pos-?), x.pos LIMIT 1`).get(...args);
  if (!hit) return [];
  return db.prepare(`SELECT weight, reps FROM sets WHERE wex_id=? AND done=1 AND kind IN ${WORKING} AND reps>0 ORDER BY pos`).all(hit.xid);
}
// Did a logged set meet its target? Same weight: reps at or above the target. Another weight: reps at
// or above what that weight needs for the same effort. Sets with no rep target (effort only) give null.
function hitTarget(t, rir, model, bw) {
  if (!t.done || !t.target_reps || !(t.reps > 0)) return null;
  if (t.weight == null || t.target_weight == null || t.weight === t.target_weight) return t.reps >= t.target_reps;
  const need = E.repsAt({ weight: t.target_weight, reps: t.target_reps }, t.weight, rir, model, bw);
  return need == null ? null : t.reps >= need;
}
function workoutView(user, id) {
  const w = workoutOf(user, id);
  const unlocked = isUnlocked(w);
  if (unlocked && !w.generated) { generate(user, w); return workoutView(user, id); }
  const m = mesoOf(user, w.meso_id);
  const s = settingsOf(user);
  const rirs = J(m.rirs, []);
  const priorities = J(m.priorities, {});
  const bw = w.bodyweight || latestBodyweight(user);
  const prevW = db.prepare('SELECT id FROM workouts WHERE meso_id=? AND day_id=? AND week=?').get(w.meso_id, w.day_id, w.week - 1);
  let ex = [];
  if (w.generated) {
    ex = db.prepare('SELECT * FROM wex WHERE workout_id=? AND removed=0 ORDER BY pos').all(w.id).map((x) => {
      const e = exercise(user, x.exercise_id);
      const model = E.loadModel(e.equipment, s);
      const sets = db.prepare('SELECT * FROM sets WHERE wex_id=? ORDER BY pos').all(x.id);
      // "last time" numbers: same day last week, else your most recent session of this exercise
      let last = [];
      if (prevW) {
        const px = db.prepare('SELECT id FROM wex WHERE workout_id=? AND exercise_id=? AND removed=0 ORDER BY pos LIMIT 1').get(prevW.id, x.exercise_id);
        if (px) last = db.prepare(`SELECT weight, reps FROM sets WHERE wex_id=? AND done=1 AND kind IN ${WORKING} ORDER BY pos`).all(px.id);
      }
      if (!last.length) { const ss = sessionsFor(user, x.exercise_id, { beforeWorkout: w.id, limit: 1 }); if (ss[0]) last = ss[0].sets; }
      // trend arrows compare with the same week and day of your previous meso
      const trendSets = trendBaseline(user, m, w, x.exercise_id);
      let wi = 0;
      const out = sets.map((t) => {
        const isWork = ['regular', 'myo', 'myomatch'].includes(t.kind);
        const tb = isWork ? trendSets[wi] || null : null;
        const l = isWork ? last[wi++] || null : null;
        // a different weight than planned: the rep target follows, at the same effort
        let adj = null;
        const echo = !t.done && t.reps != null && t.reps === t.target_reps; // reps saved as a copy of the plan
        if (isWork && !t.done && !t.skipped && (t.reps == null || echo) && t.weight != null && t.target_weight != null && t.target_reps && t.weight !== t.target_weight) {
          adj = E.repsAt({ weight: t.target_weight, reps: t.target_reps }, t.weight, rirs[w.week - 1], model, bw);
        }
        return {
          ...t, reps: adj != null && echo ? null : t.reps, last: l, plan_reps: t.target_reps, target_reps: adj ?? t.target_reps, adjusted: adj != null && adj !== t.target_reps,
          trend: t.done && tb && isWork ? E.trend(tb, { weight: t.weight, reps: t.reps }, model, bw) : null,
          on_target: isWork ? hitTarget(t, rirs[w.week - 1], model, bw) : null,
          plates: model.kind === 'plates' && (t.weight ?? t.target_weight) != null ? E.platesPerSide(t.weight ?? t.target_weight, model) : null,
        };
      });
      const notes = db.prepare("SELECT * FROM notes WHERE user_id=? AND scope='exercise' AND ref_id=? AND pinned=1 ORDER BY created_at").all(user.id, x.exercise_id);
      const dayNotes = db.prepare("SELECT * FROM notes WHERE user_id=? AND scope='wex' AND ref_id=? ORDER BY created_at").all(user.id, x.id);
      return {
        ...x, exercise: { id: e.id, name: e.name, equipment: e.equipment, muscle: e.muscle, family: e.family, custom: !!e.owner_id },
        priority: priorities[x.muscle] || 'grow', sets: out, pinned: notes, notes: dayNotes,
        rest_goal: x.rest_goal || defaultRest(user, e), suggestion: J(x.suggestion, null), model,
        bodyweight: model.bodyweight ? bw : null,
      };
    });
  } else {
    // locked: show what's planned (same day, the latest generated week)
    const src = db.prepare('SELECT id FROM workouts WHERE meso_id=? AND day_id=? AND generated=1 ORDER BY week DESC LIMIT 1').get(w.meso_id, w.day_id);
    if (src) ex = db.prepare('SELECT x.*, e.name, e.equipment FROM wex x JOIN exercises e ON e.id=x.exercise_id WHERE x.workout_id=? AND x.removed=0 ORDER BY x.pos').all(src.id)
      .map((x) => ({ id: null, muscle: x.muscle, exercise: { id: x.exercise_id, name: x.name, equipment: x.equipment }, priority: priorities[x.muscle] || 'grow', sets: [] }));
  }
  const checkins = db.prepare('SELECT * FROM checkins WHERE workout_id=?').all(w.id);
  // soreness questions: muscles here whose last check-in (an earlier workout in this meso) has no soreness yet
  const isDeload = !!m.deload && w.week === m.weeks;
  const soreness = {};
  if (w.generated && !isDeload && w.status === 'pending') {
    for (const mus of new Set(ex.map((x) => x.muscle))) {
      const c = db.prepare(`SELECT c.* FROM checkins c JOIN workouts o ON o.id=c.workout_id JOIN meso_days d ON d.id=o.day_id
        WHERE o.meso_id=? AND c.muscle=? AND o.id<>? AND (o.week < ? OR (o.week = ? AND d.pos < (SELECT pos FROM meso_days WHERE id=?)))
        ORDER BY o.week DESC, d.pos DESC LIMIT 1`).get(w.meso_id, mus, w.id, w.week, w.week, w.day_id);
      if (c) { soreness[mus] = { checkinId: c.id, answer: c.soreness }; continue; }
      // first time this muscle comes up in the meso: ask about its last session in an earlier meso
      const prev = db.prepare(`SELECT o.id FROM workouts o JOIN mesos pm ON pm.id=o.meso_id JOIN wex x ON x.workout_id=o.id
        WHERE pm.user_id=? AND pm.id<>? AND o.status='done' AND x.muscle=? AND x.removed=0
        ORDER BY COALESCE(o.finished_at, o.started_at, 0) DESC, o.week DESC, o.id DESC LIMIT 1`).get(m.user_id, w.meso_id, mus);
      if (!prev) continue; // never trained before: nothing to be sore from
      let pc = db.prepare('SELECT * FROM checkins WHERE workout_id=? AND muscle=?').get(prev.id, mus);
      if (!pc) {
        db.prepare('INSERT OR IGNORE INTO checkins (workout_id, muscle, created_at) VALUES (?,?,?)').run(prev.id, mus, now());
        pc = db.prepare('SELECT * FROM checkins WHERE workout_id=? AND muscle=?').get(prev.id, mus);
      }
      soreness[mus] = { checkinId: pc.id, answer: pc.soreness };
    }
  }
  const logged = db.prepare('SELECT MIN(s.logged_at) first, MAX(s.logged_at) last FROM sets s JOIN wex x ON x.id=s.wex_id WHERE x.workout_id=? AND s.done=1').get(w.id);
  const lastSet = db.prepare(`SELECT s.logged_at, s.rest, x.id wex_id FROM sets s JOIN wex x ON x.id=s.wex_id WHERE x.workout_id=? AND s.done=1 ORDER BY s.logged_at DESC LIMIT 1`).get(w.id);
  const day = db.prepare('SELECT * FROM meso_days WHERE id=?').get(w.day_id);
  const notes = db.prepare("SELECT * FROM notes WHERE user_id=? AND scope='workout' AND ref_id=? ORDER BY created_at").all(user.id, w.id);
  return {
    id: w.id, mesoId: m.id, mesoName: m.name, week: w.week, weeks: m.weeks, dayPos: day.pos, weekday: day.weekday, label: w.label, status: w.status,
    rir: rirs[w.week - 1], isDeload, unlocked, generated: !!w.generated, bodyweight: bw, started_at: w.started_at, finished_at: w.finished_at,
    exercises: ex, checkins, soreness, notes, firstSetAt: logged.first, lastSetAt: logged.last, lastSet,
    days: db.prepare('SELECT COUNT(*) n FROM meso_days WHERE meso_id=?').get(m.id).n,
  };
}

// ---------- logging ----------
function touchWorkout(user, workoutId, { mustUnlock = true } = {}) {
  const w = workoutOf(user, workoutId);
  if (mustUnlock && !isUnlocked(w)) throw new Bad('Finish or skip the earlier workouts first', 409);
  if (w.status === 'skipped') db.prepare("UPDATE workouts SET status='pending' WHERE id=?").run(w.id);
  if (!w.started_at) db.prepare('UPDATE workouts SET started_at=? WHERE id=?').run(now(), w.id);
  return w;
}
function updateSet(user, id, b) {
  const st = setOf(user, id);
  touchWorkout(user, st.workout_id);
  const s = settingsOf(user);
  const weight = b.weight !== undefined ? num(b.weight) : st.weight;
  let reps = b.reps !== undefined ? (num(b.reps) == null ? null : Math.max(0, Math.min(200, Math.round(num(b.reps))))) : st.reps;
  // A weight change on an unlogged set whose reps only echo the plan clears them, so the rep target follows the new weight
  if (b.weight !== undefined && b.reps === undefined && !st.done && reps != null && reps === st.target_reps) reps = null;
  if (weight != null && (weight < 0 || weight > 2000)) throw new Bad('Check the weight');
  let done = b.done !== undefined ? (b.done ? 1 : 0) : st.done;
  if (done && (reps == null || (reps < 1 && st.kind !== 'attempt'))) throw new Bad('Enter the reps first');
  const at = done ? (st.done && st.logged_at ? st.logged_at : (num(b.at) && num(b.at) <= now() + 60000 ? num(b.at) : now())) : null;
  const tx = db.transaction(() => {
    db.prepare('UPDATE sets SET weight=?, reps=?, done=?, skipped=0, logged_at=? WHERE id=?').run(weight, reps, done, at, id);
    // auto-match: later unlogged sets that had the same weight follow this change
    if (b.weight !== undefined && s.autoMatch && st.kind !== 'warmup' && st.kind !== 'attempt') {
      const old = st.weight ?? st.target_weight;
      const later = db.prepare(`SELECT * FROM sets WHERE wex_id=? AND pos>? AND done=0 AND kind IN ${WORKING}`).all(st.wex_id, st.pos);
      for (const l of later) if ((l.weight ?? l.target_weight) === old && weight != null) db.prepare('UPDATE sets SET weight=? WHERE id=?').run(weight, l.id);
    }
  });
  tx();
  const wk = db.prepare('SELECT * FROM workouts WHERE id=?').get(st.workout_id);
  if (wk && wk.status !== 'pending') refreshNext(wk);
  const pr = done && !st.done ? checkPR(user, st.exercise_id, id) : null;
  return { pr };
}
function checkPR(user, exerciseId, setId) {
  const cur = db.prepare('SELECT * FROM sets WHERE id=?').get(setId);
  if (!cur || !cur.done || cur.kind === 'warmup' || !(cur.reps > 0) || cur.weight == null) return null;
  const prior = db.prepare(`SELECT s.weight, s.reps, s.kind, s.result FROM sets s JOIN wex x ON x.id=s.wex_id JOIN workouts w ON w.id=x.workout_id JOIN mesos m ON m.id=w.meso_id
    WHERE m.user_id=? AND x.exercise_id=? AND s.done=1 AND s.id<>? AND s.kind<>'warmup' AND s.reps>0 AND s.weight IS NOT NULL`).all(user.id, exerciseId, setId);
  if (!prior.length) return null; // first time isn't a PR, it's a baseline
  const out = [];
  if (cur.kind === 'attempt' && cur.result === 'made') {
    const best = Math.max(0, ...prior.filter((p) => p.kind === 'attempt' && p.result === 'made').map((p) => p.weight));
    if (cur.weight > best) out.push(`New tested 1RM: ${cur.weight}`);
  }
  if (cur.weight > Math.max(...prior.map((p) => p.weight))) out.push(`Heaviest ever: ${cur.weight}`);
  const e = E.isMyo(cur) ? 0 : E.e1rm(cur.weight, cur.reps); const pe = Math.max(0, ...prior.filter((p) => !E.isMyo(p)).map((p) => E.e1rm(p.weight, p.reps) || 0));
  if (e && e > pe * 1.001) out.push(`Best estimated 1RM: ${Math.round(e)}`);
  const sameW = prior.filter((p) => p.weight === cur.weight);
  if (sameW.length && cur.reps > Math.max(...sameW.map((p) => p.reps))) out.push(`Most reps at ${cur.weight}: ${cur.reps}`);
  return out.length ? out : null;
}
function setAction(user, id, b) {
  const st = setOf(user, id);
  touchWorkout(user, st.workout_id);
  const s = settingsOf(user);
  const e = exercise(user, st.exercise_id);
  const model = E.loadModel(e.equipment, s);
  const act = b.action;
  return db.transaction(() => {
    if (act === 'skip') db.prepare('UPDATE sets SET skipped=1, done=0, logged_at=NULL WHERE id=?').run(id);
    else if (act === 'unskip') db.prepare('UPDATE sets SET skipped=0 WHERE id=?').run(id);
    else if (act === 'delete') {
      const n = db.prepare('SELECT COUNT(*) n FROM sets WHERE wex_id=?').get(st.wex_id).n;
      if (n <= 1) throw new Bad('An exercise needs at least one set. Remove the exercise instead.');
      db.prepare('DELETE FROM sets WHERE id=?').run(id); renumber(st.wex_id);
    } else if (act === 'addBelow') {
      db.prepare('UPDATE sets SET pos=pos+1 WHERE wex_id=? AND pos>?').run(st.wex_id, st.pos);
      db.prepare('INSERT INTO sets(wex_id,pos,kind,target_weight,target_reps,range_low,range_high) VALUES(?,?,?,?,?,?,?)')
        .run(st.wex_id, st.pos + 1, ['warmup', 'attempt'].includes(st.kind) ? 'regular' : st.kind, st.weight ?? st.target_weight, null, st.range_low, st.range_high);
    } else if (act === 'type') {
      if (!['regular', 'myo', 'myomatch'].includes(b.kind)) throw new Bad('Unknown set type');
      if (b.kind === 'myomatch') {
        const before = db.prepare("SELECT COUNT(*) n FROM sets WHERE wex_id=? AND pos<? AND kind='myo'").get(st.wex_id, st.pos).n;
        if (!before) throw new Bad('A myo-rep match set needs a myo-reps set before it');
      }
      db.prepare('UPDATE sets SET kind=? WHERE id=?').run(b.kind, id);
    } else if (act === 'test1rm') {
      if (model.kind === 'none' || model.bodyweight) throw new Bad('1RM tests are for loaded lifts (barbell, dumbbell, machine, cable)');
      const expected = num(b.expected);
      if (!(expected > 0)) throw new Bad('Enter your expected max');
      const rows = E.ramp(expected, model, s.ramp, { includeOptional: b.includeOptional !== false });
      if (!rows) throw new Bad('Could not build a ramp for that weight');
      // an unlogged set is replaced by the ramp; a logged set is kept and the ramp goes below it
      const keep = !!(st.done || st.skipped);
      const at = keep ? st.pos + 1 : st.pos;
      if (!keep) db.prepare('DELETE FROM sets WHERE id=?').run(id);
      db.prepare('UPDATE sets SET pos=pos+? WHERE wex_id=? AND pos>=?').run(rows.length, st.wex_id, at);
      const ins = db.prepare('INSERT INTO sets(wex_id,pos,kind,target_weight,target_reps,pct,rest) VALUES(?,?,?,?,?,?,?)');
      rows.forEach((r, i) => ins.run(st.wex_id, at + i, r.kind, r.weight, r.reps, r.pct, r.rest));
      renumber(st.wex_id);
    } else if (act === 'attempt') {
      if (st.kind !== 'attempt') throw new Bad('This isn\'t a 1RM attempt');
      const made = !!b.made;
      const w = num(b.weight) ?? st.weight ?? st.target_weight;
      db.prepare('UPDATE sets SET weight=?, reps=?, done=1, result=?, logged_at=COALESCE(logged_at,?) WHERE id=?').run(w, made ? 1 : 0, made ? 'made' : 'missed', now(), id);
      return { pr: made ? checkPR(user, st.exercise_id, id) : null };
    } else if (act === 'another') {
      if (st.kind !== 'attempt' || st.result !== 'made') throw new Bad('Make an attempt first');
      const next = E.nextAttempt(st.weight, model, s.minJump);
      db.prepare('UPDATE sets SET pos=pos+1 WHERE wex_id=? AND pos>?').run(st.wex_id, st.pos);
      db.prepare('INSERT INTO sets(wex_id,pos,kind,target_weight,target_reps,pct,rest) VALUES(?,?,?,?,1,?,240)').run(st.wex_id, st.pos + 1, 'attempt', next, Math.round(next / st.weight * 100));
    } else throw new Bad('Unknown action');
    return {};
  })();
}
function renumber(wexId) {
  db.prepare('SELECT id FROM sets WHERE wex_id=? ORDER BY pos, id').all(wexId).forEach((r, i) => db.prepare('UPDATE sets SET pos=? WHERE id=?').run(i, r.id));
}
function expectedMax(user, exerciseId) {
  const e = exercise(user, exerciseId);
  const s = settingsOf(user);
  const model = E.loadModel(e.equipment, s);
  const ss = sessionsFor(user, e.id, { limit: 3 });
  const v = E.expected1RM(ss, model, latestBodyweight(user));
  const top = ss[0] && ss[0].sets.some((q) => !E.isMyo(q)) ? ss[0].sets.filter((q) => !E.isMyo(q)).reduce((a, b) => ((E.e1rm(b.weight, b.reps, b.rir) || 0) > (E.e1rm(a.weight, a.reps, a.rir) || 0) ? b : a)) : null;
  return { expected: v, basis: top ? { ...top, date: ss[0].date } : null, ramp: v ? E.ramp(v, model, s.ramp) : null };
}
function rampPreview(user, exerciseId, expected, includeOptional) {
  const e = exercise(user, exerciseId); const s = settingsOf(user);
  return E.ramp(num(expected), E.loadModel(e.equipment, s), s.ramp, { includeOptional });
}

function wexAction(user, id, b) {
  const x = wexOf(user, id);
  touchWorkout(user, x.workout_id, { mustUnlock: !['note', 'pin', 'rest'].includes(b.action) });
  const act = b.action;
  return db.transaction(() => {
    if (act === 'addSet') {
      const last = db.prepare('SELECT * FROM sets WHERE wex_id=? ORDER BY pos DESC LIMIT 1').get(id);
      db.prepare('INSERT INTO sets(wex_id,pos,kind,target_weight,target_reps,range_low,range_high) VALUES(?,?,?,?,?,?,?)')
        .run(id, (last ? last.pos : -1) + 1, 'regular', last ? last.weight ?? last.target_weight : null, null, last ? last.range_low : null, last ? last.range_high : null);
    } else if (act === 'skipRest') db.prepare('UPDATE sets SET skipped=1 WHERE wex_id=? AND done=0').run(id);
    else if (act === 'remove') { db.prepare('UPDATE wex SET removed=1 WHERE id=?').run(id); }
    else if (act === 'move') {
      const list = db.prepare('SELECT id FROM wex WHERE workout_id=? AND removed=0 ORDER BY pos').all(x.workout_id).map((r) => r.id);
      const i = list.indexOf(id); const j = i + (b.dir === 'up' ? -1 : 1);
      if (j >= 0 && j < list.length) { [list[i], list[j]] = [list[j], list[i]]; list.forEach((wid, k) => db.prepare('UPDATE wex SET pos=? WHERE id=?').run(k, wid)); }
    } else if (act === 'replace') {
      const e = exercise(user, b.exercise_id);
      const s = settingsOf(user);
      const sug = suggestFor(user, e, { rir: 2, excludeWorkout: x.workout_id });
      const model = E.loadModel(e.equipment, s);
      const w = sug && sug.confidence !== 'hint' ? sug.weight : null; const r = sug && sug.confidence !== 'hint' ? sug.reps : null;
      db.prepare('UPDATE wex SET exercise_id=?, orig_exercise_id=?, suggestion=?, joint_pain=NULL WHERE id=?')
        .run(e.id, b.scope === 'today' ? (x.orig_exercise_id || x.exercise_id) : null, sug ? JSON.stringify(cleanSug(sug)) : null, id);
      const range = w != null ? E.targetRange(w, model) : null;
      db.prepare('UPDATE sets SET target_weight=?, target_reps=?, range_low=?, range_high=?, weight=NULL WHERE wex_id=? AND done=0')
        .run(model.kind === 'none' ? null : w, r, range ? range[0] : null, range ? range[1] : null, id);
    } else if (act === 'joint') {
      db.prepare('UPDATE wex SET joint_pain=? WHERE id=?').run(['some', 'painful'].includes(b.value) ? b.value : null, id);
    } else if (act === 'rest') {
      const v = num(b.seconds); db.prepare('UPDATE wex SET rest_goal=? WHERE id=?').run(v && v > 0 && v < 3600 ? Math.round(v) : null, id);
      // keep it for the rest of the meso too
      db.prepare(`UPDATE wex SET rest_goal=? WHERE exercise_id=? AND workout_id IN (SELECT id FROM workouts WHERE meso_id=?)`).run(v && v > 0 ? Math.round(v) : null, x.exercise_id, x.meso_id);
    } else if (act === 'note') {
      const t = str(b.text, 500); if (!t) throw new Bad('Write a note first');
      db.prepare('INSERT INTO notes(user_id,scope,ref_id,text,pinned,created_at) VALUES(?,?,?,?,?,?)').run(user.id, b.pinned ? 'exercise' : 'wex', b.pinned ? x.exercise_id : id, t, b.pinned ? 1 : 0, now());
    } else if (act === 'feeler') {
      // a "find your weight" step: logged as a warm-up set just above the first working set
      const w = num(b.weight); const r = Math.round(num(b.reps));
      if (!(r > 0) || r > 100) throw new Bad('Enter the reps');
      if (w != null && (w < 0 || w > 2000)) throw new Bad('Check the weight');
      const first = db.prepare(`SELECT pos FROM sets WHERE wex_id=? AND kind IN ${WORKING} AND done=0 AND skipped=0 ORDER BY pos LIMIT 1`).get(id);
      const at = first ? first.pos : (db.prepare('SELECT COALESCE(MAX(pos),-1)+1 p FROM sets WHERE wex_id=?').get(id).p);
      db.prepare('UPDATE sets SET pos=pos+1 WHERE wex_id=? AND pos>=?').run(id, at);
      db.prepare("INSERT INTO sets(wex_id,pos,kind,weight,reps,done,logged_at) VALUES(?,?,'warmup',?,?,1,?)").run(id, at, w, r, now());
    } else if (act === 'setTarget') {
      // the weight a "find your weight" sequence landed on becomes the target for the unlogged working sets
      const e = exercise(user, x.exercise_id); const model = E.loadModel(e.equipment, settingsOf(user));
      const w = num(b.weight); const r = Math.round(num(b.reps));
      if (w == null || w < 0 || w > 2000 || !(r > 0)) throw new Bad('Check the weight and reps');
      const range = E.targetRange(w, model);
      db.prepare(`UPDATE sets SET target_weight=?, target_reps=?, range_low=?, range_high=?, weight=NULL, reps=NULL WHERE wex_id=? AND done=0 AND skipped=0 AND kind IN ${WORKING}`)
        .run(w, r, range ? range[0] : null, range ? range[1] : null, id);
    } else if (act === 'plan1rm') {
      db.prepare('UPDATE wex SET plan_1rm=? WHERE id=?').run(b.value ? 1 : 0, id);
    } else throw new Bad('Unknown action');
    return {};
  })();
}
function addExerciseToWorkout(user, workoutId, b) {
  const w = touchWorkout(user, workoutId);
  const e = exercise(user, b.exercise_id);
  const m = mesoOf(user, w.meso_id);
  const pos = db.prepare('SELECT COALESCE(MAX(pos),-1)+1 p FROM wex WHERE workout_id=?').get(w.id).p;
  return { wexId: addWex(user, w.id, pos, e, MUSCLES.includes(b.muscle) ? b.muscle : e.muscle, Math.max(1, Math.min(6, num(b.sets) || 2)), J(m.rirs, [])[w.week - 1] ?? 2, null, null) };
}
function checkin(user, workoutId, b) {
  const w = workoutOf(user, workoutId);
  const muscle = MUSCLES.includes(b.muscle) ? b.muscle : null; if (!muscle) throw new Bad('Unknown muscle');
  const pick = (v, list) => (list.includes(v) ? v : null);
  db.prepare(`INSERT INTO checkins(workout_id,muscle,pump,workload,joints,created_at) VALUES(?,?,?,?,?,?)
    ON CONFLICT(workout_id,muscle) DO UPDATE SET pump=excluded.pump, workload=excluded.workload, joints=excluded.joints`)
    .run(w.id, muscle, pick(b.pump, ['low', 'good', 'great']), pick(b.workload, ['easy', 'right', 'pushed', 'too_much']), pick(b.joints, ['fine', 'some', 'painful']), now());
  if (b.joints === 'painful' || b.joints === 'some') {
    db.prepare('UPDATE wex SET joint_pain=? WHERE workout_id=? AND muscle=? AND joint_pain IS NULL').run(b.joints, w.id, muscle);
  }  if (w.status !== 'pending') refreshNext(w);
}
function soreness(user, checkinId, value) {
  const c = db.prepare('SELECT c.*, m.user_id FROM checkins c JOIN workouts w ON w.id=c.workout_id JOIN mesos m ON m.id=w.meso_id WHERE c.id=?').get(checkinId);
  if (!c || c.user_id !== user.id) throw new Bad('Not found', 404);
  if (!['never', 'early', 'on_time', 'sore'].includes(value)) throw new Bad('Pick an answer');
  db.prepare('UPDATE checkins SET soreness=? WHERE id=?').run(value, c.id);
}
function workoutAction(user, id, b) {
  const w = workoutOf(user, id);
  const act = b.action;
  return db.transaction(() => {
    if (act === 'finish') {
      if (!isUnlocked(w)) throw new Bad('Finish the earlier workouts first', 409);
      const open = db.prepare('SELECT COUNT(*) n FROM sets s JOIN wex x ON x.id=s.wex_id WHERE x.workout_id=? AND x.removed=0 AND s.done=0 AND s.skipped=0').get(w.id).n;
      if (open && !b.force) throw new Bad(`${open} set${open > 1 ? 's are' : ' is'} not logged yet`, 409);
      if (open) db.prepare('UPDATE sets SET skipped=1 WHERE done=0 AND wex_id IN (SELECT id FROM wex WHERE workout_id=?)').run(w.id);
      db.prepare("UPDATE workouts SET status='done', finished_at=? WHERE id=?").run(now(), w.id);
      maybeFinishMeso(w.meso_id);
      refreshNext(w);
    } else if (act === 'skip') {
      if (!isUnlocked(w)) throw new Bad('Skip the earlier workouts first', 409);
      if (!w.generated) generate(user, w);
      db.prepare("UPDATE workouts SET status='skipped', finished_at=? WHERE id=?").run(now(), w.id);
      maybeFinishMeso(w.meso_id);
    } else if (act === 'reopen') {
      const later = db.prepare("SELECT COUNT(*) n FROM workouts o JOIN meso_days d ON d.id=o.day_id WHERE o.meso_id=? AND o.status<>'pending' AND (o.week>? OR (o.week=? AND d.pos>(SELECT pos FROM meso_days WHERE id=?)))")
        .get(w.meso_id, w.week, w.week, w.day_id).n;
      if (later) throw new Bad('Only the most recent workout can be reopened');
      db.prepare("UPDATE workouts SET status='pending', finished_at=NULL WHERE id=?").run(w.id);
      db.prepare("UPDATE mesos SET status='active', finished_at=NULL WHERE id=?").run(w.meso_id);
    } else if (act === 'reset') {
      db.prepare('UPDATE sets SET weight=NULL, reps=NULL, done=0, skipped=0, logged_at=NULL, result=NULL WHERE wex_id IN (SELECT id FROM wex WHERE workout_id=?)').run(w.id);
      db.prepare('DELETE FROM checkins WHERE workout_id=?').run(w.id);
      db.prepare("UPDATE workouts SET status='pending', started_at=NULL, finished_at=NULL WHERE id=?").run(w.id);
    } else if (act === 'label') {
      const l = str(b.label, 40); if (!l) throw new Bad('Give it a name');
      db.prepare('UPDATE workouts SET label=? WHERE id=?').run(l, w.id);
      if (b.allWeeks) { db.prepare('UPDATE workouts SET label=? WHERE meso_id=? AND day_id=?').run(l, w.meso_id, w.day_id); db.prepare('UPDATE meso_days SET label=? WHERE id=?').run(l, w.day_id); }
    } else if (act === 'bodyweight') {
      const v = num(b.weight); if (!(v > 20 && v < 1000)) throw new Bad('Check your bodyweight');
      db.prepare('UPDATE workouts SET bodyweight=? WHERE id=?').run(v, w.id);
      db.prepare('INSERT INTO bodyweights(user_id,weight,at) VALUES(?,?,?)').run(user.id, v, now());
    } else if (act === 'note') {
      const t = str(b.text, 1000); if (!t) throw new Bad('Write a note first');
      db.prepare("INSERT INTO notes(user_id,scope,ref_id,text,created_at) VALUES(?, 'workout', ?, ?, ?)").run(user.id, w.id, t, now());
    } else throw new Bad('Unknown action');
    return {};
  })();
}
function maybeFinishMeso(mesoId) {
  const left = db.prepare("SELECT COUNT(*) n FROM workouts WHERE meso_id=? AND status='pending'").get(mesoId).n;
  if (!left) db.prepare("UPDATE mesos SET status='finished', finished_at=? WHERE id=? AND status<>'finished'").run(now(), mesoId);
}

// ---------- meso views and actions ----------
function mesoList(user) {
  return db.prepare('SELECT * FROM mesos WHERE user_id=? ORDER BY created_at DESC').all(user.id).map((m) => {
    const c = db.prepare("SELECT COUNT(*) total, SUM(status='done') done, SUM(status='skipped') skipped FROM workouts WHERE meso_id=?").get(m.id);
    const days = db.prepare('SELECT COUNT(*) n FROM meso_days WHERE meso_id=?').get(m.id).n;
    return { id: m.id, name: m.name, weeks: m.weeks, days, deload: !!m.deload, current: !!m.is_current, status: m.status, created_at: m.created_at, finished_at: m.finished_at, total: c.total, done: c.done || 0, skipped: c.skipped || 0 };
  });
}
function currentMeso(user) {
  return db.prepare('SELECT * FROM mesos WHERE user_id=? AND is_current=1').get(user.id) || null;
}
function nextWorkout(mesoId) {
  return orderedWorkouts(mesoId).find((o) => o.status === 'pending') || null;
}
function mesoView(user, id) {
  const m = mesoOf(user, id);
  const days = db.prepare('SELECT * FROM meso_days WHERE meso_id=? ORDER BY pos').all(m.id);
  const list = orderedWorkouts(m.id);
  const next = list.find((o) => o.status === 'pending');
  const grid = days.map((d) => ({ ...d, workouts: list.filter((o) => o.day_id === d.id).map((o) => ({ id: o.id, week: o.week, status: o.status, label: o.label, next: next && next.id === o.id, finished_at: o.finished_at })) }));
  // sets per muscle per week (planned = generated, done = logged)
  const rows = db.prepare(`SELECT w.week, x.muscle, COUNT(s.id) planned, SUM(s.done) done FROM workouts w JOIN wex x ON x.workout_id=w.id AND x.removed=0
    JOIN sets s ON s.wex_id=x.id AND s.kind IN ${WORKING} WHERE w.meso_id=? GROUP BY w.week, x.muscle`).all(m.id);
  const muscles = {};
  for (const r of rows) { (muscles[r.muscle] = muscles[r.muscle] || Array.from({ length: m.weeks }, () => null))[r.week - 1] = { planned: r.planned, done: r.done || 0 }; }
  const notes = db.prepare("SELECT * FROM notes WHERE user_id=? AND scope='meso' AND ref_id=? ORDER BY created_at DESC").all(user.id, m.id);
  return {
    id: m.id, name: m.name, weeks: m.weeks, deload: !!m.deload, rirs: J(m.rirs, []), priorities: J(m.priorities, {}), current: !!m.is_current, status: m.status,
    created_at: m.created_at, finished_at: m.finished_at, days: grid, muscles, notes, nextId: next ? next.id : null,
    total: list.length, done: list.filter((o) => o.status === 'done').length, skipped: list.filter((o) => o.status === 'skipped').length,
  };
}
function mesoSummary(user, id) {
  const v = mesoView(user, id);
  const s = settingsOf(user);
  const ex = db.prepare(`SELECT x.exercise_id, e.name, e.equipment, w.week, w.id wid, s.weight, s.reps, s.kind, s.result FROM wex x JOIN workouts w ON w.id=x.workout_id
    JOIN exercises e ON e.id=x.exercise_id JOIN sets s ON s.wex_id=x.id WHERE w.meso_id=? AND s.done=1 AND s.kind<>'warmup' AND s.reps>0 ORDER BY w.week`).all(id);
  const best = {};
  for (const r of ex) {
    const e1 = E.isMyo(r) ? 0 : E.e1rm(r.weight, r.reps) || 0;
    const b = best[r.exercise_id] || (best[r.exercise_id] = { name: r.name, first: null, best: null, weeks: {} });
    if (!b.first) b.first = r;
    if (e1 && (!b.best || e1 > (E.e1rm(b.best.weight, b.best.reps) || 0))) b.best = r;
    (b.weeks[r.week] = b.weeks[r.week] || []).push(`${r.weight ?? 'BW'}×${r.reps}`);
  }
  const totalSets = ex.filter((r) => r.kind !== 'attempt').length;
  return { ...v, totalSets, exercises: Object.values(best), units: s.units, incomplete: v.total - v.done - v.skipped };
}
function mesoAction(user, id, b) {
  const m = mesoOf(user, id);
  const act = b.action;
  return db.transaction(() => {
    if (act === 'rename') { const n = str(b.name, 60); if (!n) throw new Bad('Give it a name'); db.prepare('UPDATE mesos SET name=? WHERE id=?').run(n, id); }
    else if (act === 'priorities') {
      const p = {}; for (const [k, v] of Object.entries(b.priorities || {})) if (MUSCLES.includes(k) && PRIORITIES.includes(v)) p[k] = v;
      db.prepare('UPDATE mesos SET priorities=? WHERE id=?').run(JSON.stringify(p), id);
    } else if (act === 'end') {
      db.prepare("UPDATE mesos SET status='finished', finished_at=?, is_current=0 WHERE id=?").run(now(), id);
      const other = db.prepare("SELECT id FROM mesos WHERE user_id=? AND status='active' AND id<>? ORDER BY created_at DESC LIMIT 1").get(user.id, id);
      if (other) db.prepare('UPDATE mesos SET is_current=1 WHERE id=?').run(other.id);
      else db.prepare('UPDATE mesos SET is_current=1 WHERE id=?').run(id); // keep showing its summary
    } else if (act === 'makeCurrent') {
      db.prepare('UPDATE mesos SET is_current=0 WHERE user_id=?').run(user.id); db.prepare('UPDATE mesos SET is_current=1 WHERE id=?').run(id);
    } else if (act === 'note') {
      const t = str(b.text, 1000); if (!t) throw new Bad('Write a note first');
      db.prepare("INSERT INTO notes(user_id,scope,ref_id,text,created_at) VALUES(?, 'meso', ?, ?, ?)").run(user.id, id, t, now());
    } else if (act === 'addWeek') {
      if (m.weeks >= 8) throw new Bad('8 weeks is the most');
      const weeks = m.weeks + 1;
      if (m.deload) {
        // the deload moves one week later; the new week is a hard week before it
        const dl = db.prepare("SELECT COUNT(*) n FROM workouts WHERE meso_id=? AND week=? AND (status<>'pending' OR generated=1)").get(id, m.weeks).n;
        if (dl) throw new Bad('The deload has already started');
        db.prepare('UPDATE workouts SET week=? WHERE meso_id=? AND week=?').run(weeks, id, m.weeks);
        for (const d of db.prepare('SELECT * FROM meso_days WHERE meso_id=?').all(id)) db.prepare('INSERT INTO workouts(meso_id,day_id,week,label) VALUES(?,?,?,?)').run(id, d.id, m.weeks, d.label);
      } else {
        for (const d of db.prepare('SELECT * FROM meso_days WHERE meso_id=?').all(id)) db.prepare('INSERT INTO workouts(meso_id,day_id,week,label) VALUES(?,?,?,?)').run(id, d.id, weeks, d.label);
      }
      db.prepare("UPDATE mesos SET weeks=?, rirs=?, status='active', finished_at=NULL WHERE id=?").run(weeks, JSON.stringify(E.rirSchedule(weeks, !!m.deload)), id);
    } else if (act === 'removeWeek') {
      if (m.weeks <= 2) throw new Bad('A meso needs at least 2 weeks');
      const target = m.deload ? m.weeks - 1 : m.weeks; // remove the last hard week, keep the deload
      const used = db.prepare("SELECT COUNT(*) n FROM workouts WHERE meso_id=? AND week=? AND (status<>'pending' OR generated=1)").get(id, target).n;
      if (used) throw new Bad('That week has already started');
      db.prepare('DELETE FROM workouts WHERE meso_id=? AND week=?').run(id, target);
      if (m.deload) db.prepare('UPDATE workouts SET week=? WHERE meso_id=? AND week=?').run(target, id, m.weeks);
      db.prepare('UPDATE mesos SET weeks=?, rirs=? WHERE id=?').run(m.weeks - 1, JSON.stringify(E.rirSchedule(m.weeks - 1, !!m.deload)), id);
      maybeFinishMeso(id);
    } else if (act === 'saveTemplate') {
      const t = templateFromMeso(user, id);
      db.prepare('INSERT INTO templates(user_id,name,focus,days,priorities,created_at) VALUES(?,?,?,?,?,?)').run(user.id, str(b.name, 60) || m.name, 'Mine', JSON.stringify(t.days), JSON.stringify(t.priorities), now());
    } else if (act === 'delete') {
      if (String(str(b.confirm) || '').toLowerCase() !== 'delete' && str(b.confirm) !== m.name && b.confirm !== true) throw new Bad('Type delete to confirm');
      db.prepare('DELETE FROM mesos WHERE id=?').run(id);
      if (m.is_current) { const o = db.prepare('SELECT id FROM mesos WHERE user_id=? ORDER BY (status=\'active\') DESC, created_at DESC LIMIT 1').get(user.id); if (o) db.prepare('UPDATE mesos SET is_current=1 WHERE id=?').run(o.id); }
    } else throw new Bad('Unknown action');
    return {};
  })();
}
function templateFromMeso(user, id, week = 1) {
  const m = mesoOf(user, id);
  const days = db.prepare('SELECT * FROM meso_days WHERE meso_id=? ORDER BY pos').all(id).map((d) => {
    const w = db.prepare('SELECT id FROM workouts WHERE meso_id=? AND day_id=? AND week=?').get(id, d.id, week);
    const slots = w ? db.prepare('SELECT x.exercise_id, x.muscle, x.start_sets, e.name FROM wex x JOIN exercises e ON e.id=x.exercise_id WHERE x.workout_id=? AND x.removed=0 ORDER BY x.pos').all(w.id) : [];
    return { label: d.label, weekday: d.weekday, slots: slots.map((s) => ({ muscle: s.muscle, exercise_id: s.exercise_id, exercise: s.name, sets: s.start_sets })) };
  });
  return { days, priorities: J(m.priorities, {}) };
}

// Copy a meso: pick the source week; the new week 1 uses that week's weights, sets reset to the
// starting count, reps stepped down a little.
function copyPreview(user, id, week) {
  const m = mesoOf(user, id);
  const s = settingsOf(user);
  const rirs = J(m.rirs, []);
  const hard = m.deload ? m.weeks - 1 : m.weeks;
  const suggestedWeek = (() => { for (let k = hard; k >= 1; k--) { const n = db.prepare("SELECT COUNT(*) n FROM workouts WHERE meso_id=? AND week=? AND status='done'").get(id, k).n; if (n) return k; } return 1; })();
  const wk = Math.max(1, Math.min(m.weeks, Math.round(num(week) || suggestedWeek)));
  const newRir = E.rirSchedule(m.weeks, !!m.deload)[0];
  const bw = latestBodyweight(user);
  const days = db.prepare('SELECT * FROM meso_days WHERE meso_id=? ORDER BY pos').all(id).map((d) => {
    const w = db.prepare('SELECT * FROM workouts WHERE meso_id=? AND day_id=? AND week=?').get(id, d.id, wk);
    const w1 = db.prepare('SELECT * FROM workouts WHERE meso_id=? AND day_id=? AND week=1').get(id, d.id);
    const src = w && w.generated ? w : w1;
    const xs = src ? db.prepare('SELECT * FROM wex WHERE workout_id=? AND removed=0 ORDER BY pos').all(src.id) : [];
    return {
      label: d.label, weekday: d.weekday,
      slots: xs.map((x) => {
        const exId = x.orig_exercise_id || x.exercise_id;
        const e = exercise(user, exId);
        const model = E.loadModel(e.equipment, s);
        const sets = db.prepare(`SELECT * FROM sets WHERE wex_id=? AND done=1 AND kind IN ${WORKING} AND reps>0 ORDER BY pos`).all(x.id);
        const top = sets.filter((q) => !E.isMyo(q)).reduce((a, b) => (!a || (E.e1rm(E.effectiveLoad(b.weight, model, bw) || 0, b.reps) || 0) > (E.e1rm(E.effectiveLoad(a.weight, model, bw) || 0, a.reps) || 0) ? b : a), null);
        let start = null;
        if (top && exId === x.exercise_id) {
          const c = E.copyStart({ weight: top.weight, reps: top.reps }, Math.min(rirs[wk - 1] ?? 2, 4), newRir, model, bw);
          start = { ...c, label: 'Carried over', text: `From week ${wk}: ${fmtSet(top, s.units, e)}. Eased back for ${newRir} RIR.` };
        } else {
          const g = suggestFor(user, e, { rir: newRir });
          if (g && g.confidence !== 'hint') start = { weight: g.weight, reps: g.reps, label: g.label, text: g.text };
          else if (g) start = { weight: null, reps: null, label: g.label, text: g.text };
        }
        const pinned = db.prepare("SELECT text FROM notes WHERE user_id=? AND scope='exercise' AND ref_id=? AND pinned=1").all(user.id, exId).map((n) => n.text);
        return { exercise_id: exId, exercise: e.name, equipment: e.equipment, muscle: x.muscle, sets: x.start_sets, start, pinned };
      }),
    };
  });
  return { id: m.id, name: m.name, weeks: m.weeks, deload: !!m.deload, rirs, week: wk, suggestedWeek, priorities: J(m.priorities, {}), days, units: s.units };
}

// ---------- templates ----------
let BUILTIN = null;
function builtinTemplates() {
  if (!BUILTIN) {
    const t = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'templates.json'), 'utf8'));
    BUILTIN = t.templates.map((x, i) => ({ id: `b${i}`, builtin: true, ...x }));
  }
  return BUILTIN;
}
function templateList(user) {
  const mine = db.prepare('SELECT * FROM templates WHERE user_id=? ORDER BY created_at DESC').all(user.id).map((t) => {
    const days = J(t.days, []);
    return { id: `u${t.id}`, name: t.name, focus: 'Mine', daysPerWeek: days.length, builtin: false, gender: '', exercisesPrefilled: true };
  });
  return [...mine, ...builtinTemplates().map((t) => ({ id: t.id, name: t.name, focus: t.focus, gender: t.gender, daysPerWeek: t.daysPerWeek, exercisesPrefilled: t.exercisesPrefilled, builtin: true }))];
}
const WEEKDAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
function templateDetail(user, tid) {
  const byName = new Map(db.prepare('SELECT id, name, equipment FROM exercises WHERE owner_id IS NULL').all().map((e) => [e.name, e]));
  if (String(tid).startsWith('u')) {
    const t = db.prepare('SELECT * FROM templates WHERE id=? AND user_id=?').get(Number(String(tid).slice(1)), user.id);
    if (!t) throw new Bad('Template not found', 404);
    return { id: tid, name: t.name, days: J(t.days, []), priorities: J(t.priorities, {}) };
  }
  const t = builtinTemplates().find((x) => x.id === tid);
  if (!t) throw new Bad('Template not found', 404);
  const pr = {};
  const days = t.days.map((d, i) => ({
    label: `Day ${i + 1}`, weekday: WEEKDAYS[d.day] ?? null,
    slots: d.slots.map((s) => {
      if (!pr[s.muscle] || s.priority === 'emphasize') pr[s.muscle] = s.priority;
      const e = s.exercise ? byName.get(s.exercise) : null;
      return { muscle: s.muscle, exercise_id: e ? e.id : null, exercise: e ? e.name : null, sets: null };
    }),
  }));
  return { id: tid, name: t.name, days, priorities: pr };
}
function deleteTemplate(user, tid) {
  if (!String(tid).startsWith('u')) throw new Bad('Built-in templates can\'t be deleted');
  db.prepare('DELETE FROM templates WHERE id=? AND user_id=?').run(Number(String(tid).slice(1)), user.id);
}
// Fill empty slots: prefer exercises you've done for that muscle, then your preferred equipment
function autofill(user, slots, taken = []) {
  const s = settingsOf(user);
  const all = listExercises(user);
  const used = new Set(taken.filter(Boolean));
  return slots.map((sl) => {
    if (sl.exercise_id) { used.add(sl.exercise_id); return sl; }
    const pool = all.filter((e) => e.muscle === sl.muscle && !used.has(e.id));
    const pref = (e) => (s.preferredEquipment || []).includes(e.equipment);
    const pick = pool.find((e) => e.done && pref(e)) || pool.find((e) => e.done) || pool.find(pref) || pool[0];
    if (!pick) return sl;
    used.add(pick.id);
    return { ...sl, exercise_id: pick.id, exercise: pick.name };
  });
}

// Current estimated 1RM: the best straight set from your most recent 0 RIR session (the hard week
// before a deload), since easier weeks leave reps in the tank and skew the number. Without one yet, the
// newest session counts, with its planned RIR added back. Myo sets are left out.
function currentMax(user, exerciseId, model, bw) {
  const ss = sessionsFor(user, exerciseId, { limit: 60 });
  const bestOf = (g, addRir) => {
    let best = null;
    for (const t of g.sets) {
      if (E.isMyo(t)) continue;
      const e = E.e1rm(E.effectiveLoad(t.weight, model, bw), t.reps, addRir ? g.rir : 0) || 0;
      if (e && (!best || e > best.e)) best = { e, set: t };
    }
    return best;
  };
  for (const g of ss) {
    if (g.rir !== 0) continue;
    const b = bestOf(g, false);
    if (b) return { value: Math.round(b.e), date: g.date, rir0: true, weight: b.set.weight, reps: b.set.reps };
  }
  for (const g of ss) {
    const b = bestOf(g, true);
    if (b) return { value: Math.round(b.e), date: g.date, rir0: false, weight: b.set.weight, reps: b.set.reps };
  }
  return null;
}

// ---------- exercise page ----------
function exerciseDetail(user, id) {
  const e = exercise(user, id);
  const s = settingsOf(user);
  const model = E.loadModel(e.equipment, s);
  const bw = latestBodyweight(user);
  const rows = db.prepare(`SELECT s.weight, s.reps, s.kind, s.result, s.logged_at, w.week, w.id wid, m.id mid, m.name mname, m.weeks, m.deload, d.pos dpos
    FROM sets s JOIN wex x ON x.id=s.wex_id JOIN workouts w ON w.id=x.workout_id JOIN meso_days d ON d.id=w.day_id JOIN mesos m ON m.id=w.meso_id
    WHERE m.user_id=? AND x.exercise_id=? AND s.done=1 ORDER BY s.logged_at DESC, s.pos`).all(user.id, id);
  const groups = []; const byW = new Map();
  for (const r of rows) {
    if (!byW.has(r.wid)) {
      const g = { workoutId: r.wid, mesoId: r.mid, meso: r.mname, week: r.week, day: r.dpos + 1, deload: !!r.deload && r.week === r.weeks, date: r.logged_at, sets: [] };
      byW.set(r.wid, g); groups.push(g);
    }
    byW.get(r.wid).sets.unshift({ weight: r.weight, reps: r.reps, kind: r.kind, result: r.result });
  }
  // estimated 1RM over time (best per session)
  const chart = groups.map((g) => {
    let best = 0;
    for (const t of g.sets) if (t.kind !== 'warmup' && !E.isMyo(t) && t.reps > 0) best = Math.max(best, E.e1rm(E.effectiveLoad(t.weight, model, bw), t.reps) || 0);
    return { date: g.date, e1rm: Math.round(best * 10) / 10 };
  }).filter((p) => p.e1rm > 0).reverse();
  const work = rows.filter((r) => r.kind !== 'warmup' && r.reps > 0);
  const prs = {
    heaviest: work.length ? Math.max(...work.map((r) => r.weight ?? 0)) : null,
    e1rm: chart.length ? Math.max(...chart.map((c) => c.e1rm)) : null,
    tested: Math.max(0, ...rows.filter((r) => r.kind === 'attempt' && r.result === 'made').map((r) => r.weight)) || null,
  };
  const notes = db.prepare("SELECT * FROM notes WHERE user_id=? AND scope='exercise' AND ref_id=? ORDER BY created_at DESC").all(user.id, id);
  const similar = e.family ? db.prepare('SELECT id, name, equipment FROM exercises WHERE family=? AND id<>? AND (owner_id IS NULL OR owner_id=?) ORDER BY (equipment=?) DESC, name').all(e.family, id, user.id, e.equipment) : [];
  const fam = H.FAMILIES.find((f) => f.id === e.family);
  prs.current = currentMax(user, id, model, bw);
  return { ...e, custom: !!e.owner_id, howto: howToOf(e), history: groups, chart, prs, notes, similar, familyLabel: fam ? fam.label : null, units: s.units, compound: isCompound(e) };
}
// Replacement list: same family first, then the same muscle
function similarFor(user, id) {
  const e = exercise(user, id);
  const all = listExercises(user).filter((x) => x.id !== e.id && x.muscle === e.muscle);
  const sc = (x) => (x.family && x.family === e.family ? 0 : 1) * 10 + (x.equipment === e.equipment ? 0 : 1) + (x.done ? 0 : 0.5);
  return all.sort((a, b) => sc(a) - sc(b) || a.name.localeCompare(b.name));
}
function deleteNote(user, id) { db.prepare('DELETE FROM notes WHERE id=? AND user_id=?').run(id, user.id); }
function pinNote(user, id, pinned) { db.prepare('UPDATE notes SET pinned=? WHERE id=? AND user_id=?').run(pinned ? 1 : 0, id, user.id); }
function addExerciseNote(user, exerciseId, b) {
  exercise(user, exerciseId);
  const t = str(b.text, 500); if (!t) throw new Bad('Write a note first');
  db.prepare("INSERT INTO notes(user_id,scope,ref_id,text,pinned,created_at) VALUES(?, 'exercise', ?, ?, ?, ?)").run(user.id, exerciseId, t, b.pinned === false ? 0 : 1, now());
}

// ---------- progress ----------
function progress(user) {
  const s = settingsOf(user);
  const bw = latestBodyweight(user);
  const rows = db.prepare(`SELECT x.exercise_id, e.name, e.equipment, s.weight, s.reps, s.kind, s.result, s.logged_at FROM sets s JOIN wex x ON x.id=s.wex_id
    JOIN workouts w ON w.id=x.workout_id JOIN mesos m ON m.id=w.meso_id JOIN exercises e ON e.id=x.exercise_id
    WHERE m.user_id=? AND s.done=1 AND s.kind<>'warmup' AND s.reps>0 ORDER BY s.logged_at`).all(user.id);
  const by = {};
  for (const r of rows) {
    const model = E.loadModel(r.equipment, s);
    const b = by[r.exercise_id] || (by[r.exercise_id] = { id: r.exercise_id, name: r.name, equipment: r.equipment, sessions: 0, last: 0, heaviest: null, e1rm: null, tested: null, recent: [] });
    const e1 = E.isMyo(r) ? 0 : E.e1rm(E.effectiveLoad(r.weight, model, bw), r.reps) || 0;
    if (r.weight != null && (b.heaviest == null || r.weight > b.heaviest.weight)) { b.heaviest = { weight: r.weight, reps: r.reps, at: r.logged_at }; b.recent.push({ type: 'Heaviest', text: `${r.weight} ${s.units} × ${r.reps}`, at: r.logged_at }); }
    if (e1 && (b.e1rm == null || e1 > b.e1rm.value * 1.001)) { b.e1rm = { value: Math.round(e1), at: r.logged_at }; }
    if (r.kind === 'attempt' && r.result === 'made' && (b.tested == null || r.weight > b.tested.weight)) { b.tested = { weight: r.weight, at: r.logged_at }; b.recent.push({ type: 'Tested 1RM', text: `${r.weight} ${s.units}`, at: r.logged_at }); }
    b.last = r.logged_at;
  }
  const exercises = Object.values(by).sort((a, b) => b.last - a.last);
  for (const b of exercises) b.current = currentMax(user, b.id, E.loadModel(b.equipment, s), bw);
  // newest PR per exercise (the very first session is a baseline, not a PR)
  const recent = exercises.map((b) => { const r = b.recent.slice(1); return r.length ? { ...r[r.length - 1], name: b.name, id: b.id } : null; }).filter(Boolean).sort((a, b) => b.at - a.at).slice(0, 8);
  exercises.forEach((b) => delete b.recent);
  const bodyweights = db.prepare('SELECT weight, at FROM bodyweights WHERE user_id=? ORDER BY at').all(user.id);
  const cur = currentMeso(user);
  return { exercises, recent, bodyweights, units: s.units, meso: cur ? mesoView(user, cur.id) : null };
}
function addBodyweight(user, b) {
  const v = num(b.weight); if (!(v > 20 && v < 1000)) throw new Bad('Check your bodyweight');
  db.prepare('INSERT INTO bodyweights(user_id,weight,at) VALUES(?,?,?)').run(user.id, v, now());
}

// ---------- home ----------
function home(user) {
  const m = currentMeso(user);
  const s = settingsOf(user);
  let meso = null; let next = null; let last = null;
  if (m) {
    meso = mesoView(user, m.id);
    const n = nextWorkout(m.id);
    if (n) next = { id: n.id, week: n.week, label: n.label, day: db.prepare('SELECT pos FROM meso_days WHERE id=?').get(n.day_id).pos + 1 };
  }
  const lw = db.prepare(`SELECT w.id, w.label, w.week, w.finished_at, m.name FROM workouts w JOIN mesos m ON m.id=w.meso_id WHERE m.user_id=? AND w.status='done' ORDER BY w.finished_at DESC LIMIT 1`).get(user.id);
  if (lw) {
    const sets = db.prepare(`SELECT COUNT(*) n FROM sets s JOIN wex x ON x.id=s.wex_id WHERE x.workout_id=? AND s.done=1 AND s.kind IN ${WORKING}`).get(lw.id).n;
    last = { ...lw, sets };
  }
  const p = progress(user);
  return { user: { id: user.id, name: user.name, email: user.email, color: user.color }, settings: s, meso, next, last, recentPRs: p.recent.slice(0, 4), mesos: mesoList(user).slice(0, 3) };
}

// ---------- export / delete ----------
function exportAll(user) {
  const mesos = db.prepare('SELECT * FROM mesos WHERE user_id=?').all(user.id).map((m) => ({
    ...m,
    days: db.prepare('SELECT * FROM meso_days WHERE meso_id=?').all(m.id),
    workouts: db.prepare('SELECT * FROM workouts WHERE meso_id=?').all(m.id).map((w) => ({
      ...w,
      checkins: db.prepare('SELECT * FROM checkins WHERE workout_id=?').all(w.id),
      exercises: db.prepare('SELECT x.*, e.name exercise_name FROM wex x JOIN exercises e ON e.id=x.exercise_id WHERE workout_id=?').all(w.id).map((x) => ({ ...x, sets: db.prepare('SELECT * FROM sets WHERE wex_id=?').all(x.id) })),
    })),
  }));
  return {
    app: 'Jones Hypertrophy', version: 1, exported_at: new Date().toISOString(), user: { name: user.name, email: user.email }, settings: settingsOf(user),
    mesos, customExercises: db.prepare('SELECT * FROM exercises WHERE owner_id=?').all(user.id), notes: db.prepare('SELECT * FROM notes WHERE user_id=?').all(user.id),
    bodyweights: db.prepare('SELECT * FROM bodyweights WHERE user_id=?').all(user.id), templates: db.prepare('SELECT * FROM templates WHERE user_id=?').all(user.id),
  };
}
function deleteAll(user, confirm) {
  if (String(confirm || '').trim().toUpperCase() !== 'DELETE') throw new Bad('Type DELETE to confirm');
  db.transaction(() => {
    db.prepare('DELETE FROM mesos WHERE user_id=?').run(user.id);
    db.prepare('DELETE FROM notes WHERE user_id=?').run(user.id);
    db.prepare('DELETE FROM bodyweights WHERE user_id=?').run(user.id);
    db.prepare('DELETE FROM templates WHERE user_id=?').run(user.id);
    db.prepare('DELETE FROM exercises WHERE owner_id=? AND id NOT IN (SELECT exercise_id FROM wex)').run(user.id);
    db.prepare("UPDATE users SET settings='{}' WHERE id=?").run(user.id);
  })();
}

module.exports = {
  Bad, MUSCLES, EQUIPMENT, PRIORITIES, settingsOf, updateSettings, defaultSettings,
  listExercises, createExercise, updateExercise, deleteExercise, exerciseDetail, similarFor, addExerciseNote, deleteNote, pinNote,
  suggestFor, sessionsFor, createMeso, mesoList, mesoView, mesoSummary, mesoAction, copyPreview, currentMeso, nextWorkout,
  workoutView, updateSet, setAction, wexAction, addExerciseToWorkout, checkin, soreness, workoutAction, expectedMax, rampPreview,
  templateList, templateDetail, deleteTemplate, autofill, progress, addBodyweight, home, exportAll, deleteAll, generate, exercise,
  FAMILIES: H.FAMILIES.map((f) => ({ id: f.id, label: f.label })),
};
