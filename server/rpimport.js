'use strict';
// Import training history from an RP Hypertrophy export (Profile and Settings, then Export).
// The export is a JSON list of mesos -> weeks -> days -> exercises -> sets. Everything lands in the
// signed-in person's own space. Mesos already imported (by their RP id) are skipped, so it is safe
// to import the same file twice, or a newer export later.
const { db } = require('./db');
const S = require('./store');
const E = require('./engine');

const LB_KG = 0.45359237;
const PUMP = ['low', 'good', 'great'];
const WORKLOAD = ['easy', 'right', 'pushed', 'too_much'];
const SORENESS = ['never', 'early', 'on_time', 'sore']; // RP 0..3; -1 means not asked yet (first session)
const WEEKDAY = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
// RP muscle group ids, checked against the exercises in John's export
const RP_MUSCLE = { 1: 'Chest', 2: 'Back', 3: 'Triceps', 4: 'Biceps', 5: 'Shoulders', 6: 'Quads', 7: 'Glutes', 8: 'Hamstrings', 9: 'Calves', 10: 'Traps', 11: 'Forearms', 12: 'Abs' };

const ms = (t) => { const v = t ? Date.parse(t) : NaN; return isFinite(v) ? v : null; };
const done = (st) => st === 'complete';

function parse(data) {
  const list = Array.isArray(data) ? data : data && Array.isArray(data.mesos) ? data.mesos : null;
  if (!list || !list.length || !list.every((m) => m && Array.isArray(m.weeks) && m.name != null)) {
    throw new S.Bad('That doesn\'t look like an RP export. In RP, open Profile and Settings, then Export, and pick the file it gives you.');
  }
  return list.filter((m) => !m.deletedAt);
}

function rirsOf(m) {
  const digits = String(m.microRirs ?? '').split('').map(Number);
  const weeks = m.weeks.length;
  if (digits.length === weeks && digits.every((d) => d >= 0 && d <= 8)) return digits;
  return null;
}

function plan(user, data) {
  const mesos = parse(data);
  const s = S.settingsOf(user);
  const have = new Set(db.prepare("SELECT json_extract(source,'$.rp') rp FROM mesos WHERE user_id=? AND source LIKE '%\"rp\"%'").all(user.id).map((r) => String(r.rp)));
  const lib = new Map(db.prepare('SELECT * FROM exercises WHERE owner_id IS NULL').all().map((e) => [e.name.toLowerCase(), e]));
  const mine = new Map(db.prepare('SELECT * FROM exercises WHERE owner_id=?').all(user.id).map((e) => [e.name.toLowerCase(), e]));
  const fresh = mesos.filter((m) => !have.has(String(m.id)));
  const names = new Map(); let sets = 0; let workouts = 0;
  for (const m of fresh) for (const w of m.weeks) for (const d of w.days || []) {
    if ((d.exercises || []).some((x) => (x.sets || []).some((t) => done(t.status)))) workouts++;
    for (const x of d.exercises || []) {
      names.set(String(x.name || '').toLowerCase(), { name: String(x.name || '').trim(), mg: x.muscleGroupId });
      for (const t of x.sets || []) if (done(t.status)) sets++;
    }
  }
  const unknown = [...names.entries()].filter(([k]) => !lib.has(k) && !mine.has(k)).map(([, v]) => v);
  // the newest meso that isn't finished in RP can carry on in JH
  const hasCurrent = !!db.prepare("SELECT 1 FROM mesos WHERE user_id=? AND is_current=1 AND status='active'").get(user.id);
  const open = hasCurrent ? null : fresh.filter((m) => !m.finishedAt).sort((a, b) => (ms(b.createdAt) || 0) - (ms(a.createdAt) || 0))[0] || null;
  const dates = fresh.map((m) => ms(m.createdAt)).filter(Boolean);
  return {
    s, lib, mine, fresh, unknown, open,
    summary: {
      mesos: fresh.length, alreadyImported: mesos.length - fresh.length, workouts, sets,
      exercises: names.size, newCustomExercises: unknown.map((u) => u.name),
      from: dates.length ? Math.min(...dates) : null, to: dates.length ? Math.max(...dates) : null,
      continueMeso: open ? open.name : null,
      units: [...new Set(fresh.map((m) => m.unit || 'lb'))], yourUnits: s.units,
    },
  };
}

function preview(user, data) { return plan(user, data).summary; }

function run(user, data, opts = {}) {
  const p = plan(user, data);
  if (!p.fresh.length) return { ...p.summary, imported: 0 };
  const { s, lib, mine } = p;
  const insEx = db.prepare('INSERT INTO exercises(owner_id,name,muscle,equipment,created_at) VALUES(?,?,?,?,?)');
  for (const u of p.unknown) {
    const muscle = RP_MUSCLE[u.mg] || 'Chest';
    const id = Number(insEx.run(user.id, u.name.slice(0, 80), muscle, 'Machine', Date.now()).lastInsertRowid);
    mine.set(u.name.toLowerCase(), { id, name: u.name, muscle, equipment: 'Machine' });
  }
  const exOf = (name) => { const k = String(name || '').toLowerCase(); return lib.get(k) || mine.get(k); };

  const carryOn = opts.continue !== false && p.open ? p.open : null;

  const qMeso = db.prepare('INSERT INTO mesos(user_id,name,weeks,deload,rirs,priorities,is_current,status,source,created_at,finished_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
  const qDay = db.prepare('INSERT INTO meso_days(meso_id,pos,label,weekday) VALUES(?,?,?,?)');
  const qWork = db.prepare('INSERT INTO workouts(meso_id,day_id,week,label,status,generated,bodyweight,started_at,finished_at) VALUES(?,?,?,?,?,?,?,?,?)');
  const qWex = db.prepare('INSERT INTO wex(workout_id,pos,exercise_id,muscle,start_sets,joint_pain) VALUES(?,?,?,?,?,?)');
  const qSet = db.prepare('INSERT INTO sets(wex_id,pos,kind,target_weight,target_reps,range_low,range_high,weight,reps,done,skipped,logged_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
  const qChk = db.prepare('INSERT OR IGNORE INTO checkins(workout_id,muscle,pump,workload,joints,soreness,created_at) VALUES(?,?,?,?,?,?,?)');
  const qSore = db.prepare('UPDATE checkins SET soreness=? WHERE id=?');
  const qChkId = db.prepare('SELECT id FROM checkins WHERE workout_id=? AND muscle=?');
  const qBw = db.prepare('INSERT INTO bodyweights(user_id,weight,at) SELECT ?,?,? WHERE NOT EXISTS (SELECT 1 FROM bodyweights WHERE user_id=? AND at=?)');

  let nSets = 0; let nWorkouts = 0; let currentId = null;
  const ordered = p.fresh.slice().sort((a, b) => (ms(a.createdAt) || 0) - (ms(b.createdAt) || 0));
  if (carryOn) db.prepare('UPDATE mesos SET is_current=0 WHERE user_id=?').run(user.id);
  for (const m of ordered) {
    const live = m === carryOn;
    const f = (m.unit || 'lb') === s.units ? 1 : s.units === 'kg' ? LB_KG : 1 / LB_KG;
    const wt = (v) => (v == null || !isFinite(Number(v)) ? null : Math.round(Number(v) * f * 100) / 100);
    const weeks = m.weeks.length;
    const rirs = rirsOf(m) || E.rirSchedule(weeks, true);
    const deload = rirs[rirs.length - 1] === 8 ? 1 : 0;
    const prio = {};
    for (const v of Object.values(m.priorities || {})) {
      const mus = RP_MUSCLE[v && v.muscleGroupId]; if (mus && S.PRIORITIES.includes(v.mgPriorityType)) prio[mus] = v.mgPriorityType;
    }
    const lastAt = Math.max(0, ...m.weeks.flatMap((w) => (w.days || []).map((d) => ms(d.finishedAt) || 0)), ms(m.finishedAt) || 0);
    const mid = Number(qMeso.run(user.id, String(m.name).slice(0, 80) || 'RP meso', weeks, deload, JSON.stringify(rirs), JSON.stringify(prio),
      live ? 1 : 0, live ? 'active' : 'finished', JSON.stringify({ rp: m.id, from: m.generatedFrom || null }), ms(m.createdAt) || Date.now(),
      live ? null : (ms(m.finishedAt) || lastAt || ms(m.updatedAt) || Date.now())).lastInsertRowid);
    if (live) currentId = mid;
    // days come from the first week, by position
    const first = (m.weeks[0].days || []).slice().sort((a, b) => a.position - b.position);
    const dayIds = first.map((d, i) => {
      const label = String(d.label || `Day ${i + 1}`).slice(0, 40);
      return Number(qDay.run(mid, i, label, WEEKDAY[label.toLowerCase()] ?? null).lastInsertRowid);
    });
    const lastCheck = {}; // muscle -> checkin id of the previous session, for soreness
    m.weeks.forEach((w, wi) => {
      (w.days || []).slice().sort((a, b) => a.position - b.position).forEach((d, di) => {
        const dayId = dayIds[di] ?? dayIds[dayIds.length - 1];
        const exs = (d.exercises || []).slice().sort((a, b) => a.position - b.position);
        const anyDone = exs.some((x) => (x.sets || []).some((t) => done(t.status)));
        let status; let build;
        if (d.status === 'skipped') { status = 'skipped'; build = anyDone; }
        else if (d.status === 'complete' || (!live && anyDone)) { status = 'done'; build = true; }
        else if (live) { status = 'pending'; build = anyDone || wi === 0; }
        else { status = 'skipped'; build = false; }
        const setTimes = exs.flatMap((x) => (x.sets || []).map((t) => ms(t.finishedAt))).filter(Boolean);
        const started = setTimes.length ? Math.min(...setTimes) : null;
        const bw = wt(d.bodyweight);
        const wid = Number(qWork.run(mid, dayId, wi + 1, String(d.label || '').slice(0, 40), status, build || !live ? 1 : 0, bw,
          started, status === 'pending' ? null : (ms(d.finishedAt) || (setTimes.length ? Math.max(...setTimes) : null))).lastInsertRowid);
        if (anyDone) nWorkouts++;
        if (bw && d.bodyweightAt) qBw.run(user.id, bw, ms(d.bodyweightAt), user.id, ms(d.bodyweightAt));
        if (!build) return;
        exs.forEach((x, xi) => {
          const e = exOf(x.name); if (!e) return;
          const jp = x.jointPain >= 2 ? 'painful' : x.jointPain === 1 ? 'some' : null;
          const sets = (x.sets || []).slice().sort((a, b) => a.position - b.position);
          const xid = Number(qWex.run(wid, xi, e.id, e.muscle, Math.max(1, sets.length), jp).lastInsertRowid);
          // RP logs bodyweight lifts as the total load (bodyweight, minus assistance or plus added weight);
          // JH logs only what you set on the machine or belt
          const eq = e.equipment;
          const load = (v, t) => {
            if (v == null) return null;
            if (eq === 'Bodyweight only') return null;
            const bwt = Number(t.bodyweight);
            if (eq === 'Machine assisted' && bwt > 0) return wt(Math.max(0, bwt - v));
            if (eq === 'Bodyweight + added weight' && bwt > 0) return wt(Math.max(0, v - bwt));
            return wt(v);
          };
          sets.forEach((t, ti) => {
            const ok = done(t.status);
            let lo = load(t.weightTargetMin, t); let hi = load(t.weightTargetMax, t);
            if (lo != null && hi != null && lo > hi) [lo, hi] = [hi, lo];
            qSet.run(xid, ti, t.setType === 'myorep' ? 'myo' : t.setType === 'myorep-match' ? 'myomatch' : 'regular',
              load(t.weightTarget, t), t.repsTarget ?? null, lo, hi,
              load(t.weight, t), t.reps ?? null, ok ? 1 : 0, t.status === 'skipped' ? 1 : 0, ok ? ms(t.finishedAt) : null);
            if (ok) nSets++;
          });
        });
        for (const g of d.muscleGroups || []) {
          const mus = RP_MUSCLE[g.muscleGroupId]; if (!mus) continue;
          if (g.soreness >= 0 && g.soreness <= 3 && lastCheck[mus]) qSore.run(SORENESS[g.soreness], lastCheck[mus]);
          if (g.pump == null && g.workload == null) continue;
          qChk.run(wid, mus, PUMP[g.pump] ?? null, WORKLOAD[g.workload] ?? null, null, null, ms(g.updatedAt) || Date.now());
          const c = qChkId.get(wid, mus); if (c) lastCheck[mus] = c.id;
        }
      });
    });
  }
  return { ...p.summary, imported: ordered.length, workouts: nWorkouts, sets: nSets, currentMesoId: currentId };
}

module.exports = { preview, run, RP_MUSCLE };
