'use strict';
// All of JH's training math lives here as small pure functions, so it can be tested on its own
// (test/engine.test.js) and shared with the browser (served as /engine.js).
// Weights are in the person's own unit (lb or kg). Internally we work in hundredths to avoid
// floating point drift (102.5 stays 102.5).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.JHEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const H = 100; // hundredths
  const toH = (w) => Math.round(Number(w) * H);
  const fromH = (h) => Math.round(h) / H;
  const EPS = 1e-9;

  // ---------- defaults ----------
  const DEFAULT_SETTINGS = {
    lb: {
      units: 'lb', barWeight: 45, smithBar: 0, plates: [45, 35, 25, 10, 5, 2.5], plateCounts: null,
      dumbbellStep: 5, cableStep: 5, machineStep: 2.5, addedStep: 5, assistStep: 5, minJump: 5,
    },
    kg: {
      units: 'kg', barWeight: 20, smithBar: 0, plates: [25, 20, 15, 10, 5, 2.5, 1.25], plateCounts: null,
      dumbbellStep: 2, cableStep: 2.5, machineStep: 1.25, addedStep: 2.5, assistStep: 2.5, minJump: 2.5,
    },
  };
  const DEFAULT_RAMP = [
    { pct: 40, reps: 5, rest: 60 },
    { pct: 60, reps: 3, rest: 90 },
    { pct: 75, reps: 2, rest: 120 },
    { pct: 85, reps: 1, rest: 150 },
    { pct: 92, reps: 1, rest: 180, optional: true },
  ];

  // ---------- loading models ----------
  // How a weight can actually be put together for each equipment type.
  function loadModel(equipment, s) {
    s = s || DEFAULT_SETTINGS.lb;
    switch (equipment) {
      case 'Barbell': return { kind: 'plates', bar: Number(s.barWeight), plates: s.plates, counts: s.plateCounts };
      case 'Smith machine': return { kind: 'plates', bar: Number(s.smithBar || 0), plates: s.plates, counts: s.plateCounts };
      case 'Dumbbell': return { kind: 'step', step: Number(s.dumbbellStep), min: Number(s.dumbbellStep) };
      case 'Cable': case 'Freemotion': return { kind: 'step', step: Number(s.cableStep), min: Number(s.cableStep) };
      case 'Machine': return { kind: 'step', step: Number(s.machineStep), min: 0 };
      case 'Bodyweight + added weight': return { kind: 'step', step: Number(s.addedStep), min: 0, bodyweight: 'plus' };
      case 'Machine assisted': return { kind: 'step', step: Number(s.assistStep), min: 0, bodyweight: 'assist' };
      case 'Bodyweight only': return { kind: 'none', bodyweight: 'only' };
      default: return { kind: 'step', step: Number(s.machineStep) || 2.5, min: 0 };
    }
  }

  // Every per-side plate total you can build (in hundredths), for a plate set. Unlimited plates
  // of each size unless counts are given (counts are per side).
  const sideCache = new Map();
  function perSideTable(plates, counts, maxSide) {
    const key = JSON.stringify([plates, counts, maxSide]);
    if (sideCache.has(key)) return sideCache.get(key);
    const ps = plates.map((p, i) => ({ w: toH(p), n: counts && counts[i] != null ? Number(counts[i]) : Infinity }))
      .filter((p) => p.w > 0).sort((a, b) => b.w - a.w);
    // Work on a grid of the greatest common divisor so arrays stay small
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);
    const g = ps.reduce((acc, p) => gcd(acc, p.w), 0) || 1;
    const size = Math.ceil(toH(maxSide) / g) + 1;
    // best[i] = fewest plates making i*g per side (prefers bigger plates on ties), -1 if impossible
    const best = new Int32Array(size).fill(-1);
    const pick = new Array(size); // plate list per total
    best[0] = 0; pick[0] = [];
    if (ps.every((p) => p.n === Infinity)) {
      for (let i = 1; i < size; i++) {
        for (const p of ps) {
          const u = p.w / g;
          if (u <= i && best[i - u] >= 0 && (best[i] < 0 || best[i - u] + 1 < best[i])) {
            best[i] = best[i - u] + 1; pick[i] = [p.w, ...pick[i - u]];
          }
        }
      }
    } else {
      // bounded: expand into individual plates (0/1 knapsack, fewest plates)
      const items = [];
      for (const p of ps) for (let k = 0; k < Math.min(p.n, 40); k++) items.push(p.w / g);
      for (const u of items) {
        for (let i = size - 1; i >= u; i--) {
          if (best[i - u] >= 0 && (best[i] < 0 || best[i - u] + 1 < best[i])) { best[i] = best[i - u] + 1; pick[i] = [...pick[i - u], u * g]; }
        }
      }
      for (let i = 0; i < size; i++) if (pick[i]) pick[i] = pick[i].slice().sort((a, b) => b - a);
    }
    const out = { g, best, pick, size };
    sideCache.set(key, out);
    return out;
  }

  // Round a weight to one you can actually load. mode: 'nearest' | 'floor' | 'ceil'.
  function roundLoad(w, model, mode = 'nearest') {
    if (w == null || !isFinite(w)) return null;
    if (model.kind === 'none') return null;
    if (model.kind === 'step') {
      const st = toH(model.step) || 1;
      const x = toH(w) / st;
      let n = mode === 'floor' ? Math.floor(x + EPS) : mode === 'ceil' ? Math.ceil(x - EPS) : Math.round(x);
      let h = n * st;
      if (h < toH(model.min || 0)) h = toH(model.min || 0);
      return fromH(h);
    }
    // plates
    const bar = toH(model.bar);
    if (toH(w) <= bar) return fromH(bar);
    const side = (toH(w) - bar) / 2;
    const t = perSideTable(model.plates, model.counts, Math.max(fromH(side) * 1.5 + 50, 100));
    const at = (i) => i >= 0 && i < t.size && t.best[i] >= 0;
    const x = side / t.g;
    let lo = Math.floor(x + EPS); while (lo > 0 && !at(lo)) lo--;
    let hi = Math.ceil(x - EPS); while (hi < t.size && !at(hi)) hi++;
    if (hi >= t.size) hi = null;
    let i;
    if (mode === 'floor') i = lo;
    else if (mode === 'ceil') i = hi ?? lo;
    else i = hi == null ? lo : (x - lo <= hi - x ? lo : hi); // ties go down (safer)
    return fromH(bar + 2 * i * t.g);
  }

  // Plates for ONE side of the bar for a total weight, biggest first. null if it can't be built.
  function platesPerSide(total, model) {
    if (model.kind !== 'plates') return null;
    const bar = toH(model.bar);
    const side2 = toH(total) - bar;
    if (side2 < 0 || side2 % 2 !== 0) return side2 === 0 ? [] : null;
    const side = side2 / 2;
    if (side === 0) return [];
    const t = perSideTable(model.plates, model.counts, Math.max(fromH(side) * 1.5 + 50, 100));
    if (side % t.g !== 0) return null;
    const i = side / t.g;
    if (i >= t.size || t.best[i] < 0) return null;
    return t.pick[i].map(fromH);
  }
  const platesText = (list) => (list == null ? '' : list.length ? list.join(' + ') : 'empty bar');

  // ---------- strength estimates ----------
  // Estimated 1-rep max (Epley), counting reps left in reserve as reps you could have done.
  function e1rm(weight, reps, rir = 0) {
    const n = Number(reps) + Number(rir || 0);
    if (!(weight > 0) || !(n > 0)) return null;
    if (n <= 1) return Number(weight);
    return Number(weight) * (1 + Math.min(n, 30) / 30);
  }
  // The heaviest weight for a number of reps at a given RIR, from an estimated max.
  function weightFor(max, reps, rir = 0) {
    const n = Number(reps) + Number(rir || 0);
    if (!(max > 0) || !(n > 0)) return null;
    if (n <= 1) return max;
    return max / (1 + Math.min(n, 30) / 30);
  }
  // Effective load for bodyweight movements
  function effectiveLoad(weight, model, bodyweight) {
    const bw = Number(bodyweight) || 0;
    if (model.bodyweight === 'only') return bw || null;
    if (model.bodyweight === 'plus') return bw + (Number(weight) || 0);
    if (model.bodyweight === 'assist') return bw ? Math.max(bw - (Number(weight) || 0), 1) : null;
    return weight == null ? null : Number(weight);
  }

  // ---------- weekly effort (reps in reserve) ----------
  const RIR_TABLE = { 1: [2], 2: [1, 0], 3: [2, 1, 0], 4: [3, 2, 1, 0], 5: [3, 2, 2, 1, 0], 6: [3, 3, 2, 2, 1, 0], 7: [3, 3, 2, 2, 1, 1, 0], 8: [3, 3, 2, 2, 2, 1, 1, 0] };
  function rirSchedule(weeks, deload = true) {
    const hard = deload ? weeks - 1 : weeks;
    const list = (RIR_TABLE[Math.max(1, Math.min(8, hard))] || [2, 1, 0]).slice();
    if (deload) list.push(8); // deload shows as 8 RIR (very easy)
    return list;
  }

  // ---------- progression ----------
  // Next week's target for one set, from what was actually done on it.
  function nextTarget(prev, model) {
    if (!prev || !(prev.reps > 0)) return null;
    const W = prev.weight == null ? null : Number(prev.weight);
    const R = Number(prev.reps);
    if (model.kind === 'none' || model.bodyweight === 'assist' || W == null || !(W > 0)) {
      return { weight: W, reps: R + 1, why: '+1 rep' };
    }
    const goal = W * 1.025;
    const up = roundLoad(goal, model, 'floor');
    if (up != null && toH(up) > toH(W)) return { weight: up, reps: R, why: `+${fromH(toH(up) - toH(W))} (about 2.5%)` };
    return { weight: W, reps: R + 1, why: '+1 rep (next weight step is too big)' };
  }
  function deloadTarget(prev, model) {
    if (!prev || !(prev.reps > 0)) return null;
    const reps = Math.max(1, Math.round(Number(prev.reps) * 2 / 3));
    if (model.kind === 'none' || prev.weight == null || model.bodyweight === 'assist') return { weight: prev.weight ?? null, reps };
    const w = Number(prev.weight);
    let d = roundLoad(w * 0.9, model, 'nearest');
    if (d != null && d >= w) d = roundLoad(w * 0.9, model, 'floor'); // a deload always drops when it can
    return { weight: d, reps };
  }
  // Suggested range around a target, so you can adjust to the day (about 10% under to 5% over)
  function targetRange(weight, model) {
    if (weight == null || model.kind === 'none') return null;
    let lo = roundLoad(weight * 0.9, model, 'nearest');
    let hi = roundLoad(weight * 1.05, model, 'nearest');
    // at least one loadable step each side, so light weights still get a range
    if (lo != null && lo >= weight) lo = roundLoad(weight - 0.01, model, 'floor');
    if (hi != null && hi <= weight) hi = roundLoad(weight + 0.01, model, 'ceil') ?? hi;
    if (lo != null && lo > weight) lo = weight;
    return [lo, hi];
  }

  // Sets for next week from the check-in after a muscle (our rules, matched to John's tests).
  // pump: low|good|great  workload: easy|right|pushed|too_much  soreness: never|early|on_time|sore
  function setsDelta({ pump, workload, priority, soreness } = {}) {
    let d = 0; let why = '';
    if (workload === 'too_much') { d = -1; why = 'workload was too much'; }
    else if (workload === 'pushed') {
      if (pump === 'great' || (priority === 'emphasize' || priority === 'focus')) { d = 0; why = 'pushed hard, holding steady'; }
      else { d = -1; why = 'pushed hard without a great pump'; }
    } else if (pump === 'low' && (workload === 'easy' || workload === 'right')) { d = 1; why = `low pump, ${workload === 'easy' ? 'workload easy' : 'workload about right'}`; }
    else if (pump === 'good' && workload === 'easy') { d = 1; why = 'good pump but workload easy'; }
    else if (pump || workload) { d = 0; why = 'workload about right'; }
    if (soreness === 'sore' && d > 0) { d = 0; why = 'still sore from last time'; }
    if (soreness === 'sore' && d === 0 && workload !== 'easy' && pump) { why = why || 'still sore from last time'; }
    if (priority === 'maintain' && d > 0) { d = 0; why = 'maintain muscle, sets stay low'; }
    if (!why) why = 'no check-in';
    return { delta: d, why: (d > 0 ? '+1 set: ' : d < 0 ? '-1 set: ' : 'Same sets: ') + why };
  }
  // Spread a muscle's set change over its exercises in one workout. counts: sets per exercise.
  // Adds to the exercise with the fewest sets, removes from the one with the most; never below 1,
  // and never over the per-session cap for the muscle.
  function applySetsDelta(counts, delta, cap = 8) {
    const out = counts.slice();
    if (!out.length) return out;
    const total = () => out.reduce((a, b) => a + b, 0);
    if (delta > 0 && total() < cap) {
      let i = 0; for (let k = 1; k < out.length; k++) if (out[k] < out[i]) i = k;
      out[i] += 1;
    } else if (delta < 0) {
      let i = -1; for (let k = 0; k < out.length; k++) if (out[k] > 1 && (i < 0 || out[k] >= out[i])) i = k;
      if (i >= 0) out[i] -= 1;
    }
    return out;
  }

  // ---------- trend badge ----------
  function trend(prev, cur, model, bodyweight) {
    if (!prev || !cur || !(prev.reps > 0) || !(cur.reps > 0)) return null;
    const lp = effectiveLoad(prev.weight, model || { kind: 'step' }, bodyweight);
    const lc = effectiveLoad(cur.weight, model || { kind: 'step' }, bodyweight);
    if (!lp || !lc) return cur.reps > prev.reps ? 'up' : cur.reps < prev.reps ? 'down' : 'flat';
    const a = e1rm(lp, prev.reps); const b = e1rm(lc, cur.reps);
    const r = b / a;
    return r > 1.005 ? 'up' : r < 0.995 ? 'down' : 'flat';
  }

  // ---------- starting weights from history ----------
  // sessions: newest first, [{ date: ms, sets: [{ weight, reps, rir }] }] (working sets only)
  function historyMax(sessions, model, bodyweight) {
    const use = (sessions || []).filter((s) => s.sets && s.sets.length).slice(0, 3);
    if (!use.length) return null;
    const weights = [3, 2, 1];
    let sum = 0; let wsum = 0; const per = [];
    use.forEach((s, i) => {
      let best = null; let top = null;
      for (const st of s.sets) {
        const load = effectiveLoad(st.weight, model, bodyweight);
        const e = e1rm(load, st.reps, st.rir || 0);
        if (e && (best == null || e > best)) { best = e; top = st; }
      }
      if (best) { sum += best * weights[i]; wsum += weights[i]; per.push({ date: s.date, e1rm: best, top }); }
    });
    if (!wsum) return null;
    return { e1rm: sum / wsum, sessions: per };
  }
  const DAY = 86400000;
  function ageFactor(lastDate, now) {
    const days = (now - lastDate) / DAY;
    if (days >= 90) return { factor: 0.9, note: 'about 10% lighter after 3 months off' };
    if (days >= 42) return { factor: 0.95, note: 'about 5% lighter after 6 weeks off' };
    return { factor: 1, note: '' };
  }
  // Fit an estimated max to a target of reps at an RIR, as a loadable weight (rounded down, to start safe)
  function fitWeight(max, reps, rir, model, bodyweight) {
    const eff = weightFor(max, reps, rir);
    if (eff == null) return null;
    if (model.kind === 'none') return null;
    const bw = Number(bodyweight) || 0;
    if (model.bodyweight === 'plus') return eff - bw <= 0 ? 0 : roundLoad(eff - bw, model, 'floor');
    if (model.bodyweight === 'assist') return bw ? roundLoad(Math.max(bw - eff, 0), model, 'ceil') : null;
    return roundLoad(eff, model, 'floor');
  }
  function suggestFromHistory(sessions, { reps, rir = 2, now = Date.now(), model, bodyweight } = {}) {
    const hm = historyMax(sessions, model, bodyweight);
    if (!hm) return null;
    const last = hm.sessions[0];
    const age = ageFactor(last.date, now);
    const r = reps || Math.max(5, Math.min(30, Number(last.top.reps) || 10));
    const max = hm.e1rm * age.factor;
    const weight = fitWeight(max, r, rir, model, bodyweight);
    return { weight, reps: r, rir, e1rm: max, basis: { weight: last.top.weight, reps: last.top.reps, date: last.date }, ageNote: age.note, confidence: 'history' };
  }
  // From a similar exercise: scale the source's max by the ratio between them and take 5% off.
  function suggestFromSimilar(source, ratio, { reps = 10, rir = 2, model, bodyweight, personal = false, crossEquipment = false } = {}) {
    if (!source || !(source.e1rm > 0) || !(ratio > 0)) return null;
    const max = source.e1rm * ratio * 0.95;
    return {
      weight: fitWeight(max, reps, rir, model, bodyweight), reps, rir, e1rm: max, ratio,
      confidence: crossEquipment ? 'hint' : personal ? 'personal' : 'rough',
    };
  }

  // ---------- copy a meso: week 1 from a source week ----------
  // Same weight with one rep fewer for the easier first week. If that leaves under 5 reps, drop the
  // weight so 5 reps fit at the new effort.
  function copyStart(top, srcRir, newRir, model, bodyweight) {
    if (!top || !(top.reps > 0)) return null;
    let reps = Math.max(1, Number(top.reps) - 1);
    let weight = top.weight == null ? null : Number(top.weight);
    if (reps < 5 && weight > 0 && model.kind !== 'none') {
      const load = effectiveLoad(weight, model, bodyweight);
      const max = e1rm(load, top.reps, srcRir || 0);
      reps = 5;
      const w = fitWeight(max, 5, newRir, model, bodyweight);
      if (w != null) weight = w;
    }
    return { weight, reps };
  }

  // ---------- Test 1RM ramp ----------
  function expected1RM(sessions, model, bodyweight) {
    const hm = historyMax(sessions, model, bodyweight);
    if (!hm) return null;
    const best = Math.max(...hm.sessions.map((s) => s.e1rm));
    if (model.bodyweight) return null; // 1RM tests are for loaded lifts
    return roundLoad(best, model, 'nearest');
  }
  function ramp(expected, model, steps = DEFAULT_RAMP, { includeOptional = true } = {}) {
    const attempt = roundLoad(Number(expected), model, 'nearest');
    if (!attempt) return null;
    const rows = [];
    let prev = 0;
    for (const st of steps) {
      if (st.optional && !includeOptional) continue;
      let w = roundLoad(attempt * st.pct / 100, model, 'nearest');
      if (model.kind === 'plates' && w < model.bar) w = model.bar;
      if (rows.length === 0 && model.kind === 'plates') w = Math.max(w, model.bar);
      if (!(w > prev) || !(w < attempt)) continue; // drop steps that would repeat or reach the attempt
      rows.push({ kind: 'warmup', pct: st.pct, weight: w, reps: st.reps, rest: st.rest, optional: !!st.optional, plates: platesPerSide(w, model) });
      prev = w;
    }
    rows.push({ kind: 'attempt', pct: 100, weight: attempt, reps: 1, rest: 240, plates: platesPerSide(attempt, model) });
    return rows;
  }
  // After a made attempt: about +2.5%, at least the minimum jump, rounded up to a loadable weight
  function nextAttempt(w, model, minJump = 5) {
    const goal = Math.max(Number(w) * 1.025, Number(w) + Number(minJump));
    return roundLoad(goal, model, 'ceil');
  }

  // ---------- set timer ----------
  function restState(lastAt, now, goalSec) {
    if (!lastAt) return null;
    const elapsed = Math.max(0, Math.floor((now - lastAt) / 1000));
    const goal = Number(goalSec) || 0;
    return { elapsed, goal, reached: goal > 0 && elapsed >= goal, pct: goal ? Math.min(1, elapsed / goal) : 0 };
  }
  const clock = (sec) => {
    sec = Math.max(0, Math.floor(sec));
    const h = Math.floor(sec / 3600); const m = Math.floor((sec % 3600) / 60); const s = sec % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
  };

  return {
    DEFAULT_SETTINGS, DEFAULT_RAMP, loadModel, roundLoad, platesPerSide, platesText, e1rm, weightFor, effectiveLoad,
    rirSchedule, nextTarget, deloadTarget, targetRange, setsDelta, applySetsDelta, trend, historyMax, ageFactor,
    fitWeight, suggestFromHistory, suggestFromSimilar, copyStart, expected1RM, ramp, nextAttempt, restState, clock,
  };
});
