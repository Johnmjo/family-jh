// Today's workout, in the compact layout: one exercise open at a time, the set timer on top.
import { api, E, esc, icon, toast, celebrate, sheet, menu, confirmSheet, promptSheet, chime, mColor, PRIORITY, WEEKDAY, fmtW, fmtDate, rirText, rirHint, infoSheet, $, $$, ApiError } from './ui.js';
import { ctx, go, loadHome, seq } from './app.js';

const app = () => document.getElementById('app');

export async function today() {
  const h = await loadHome();
  if (h.next) return workout(h.next.id, { replaceRoute: true });
  // nothing to train: meso finished or none yet
  const m = h.meso;
  app().innerHTML = `
    <div class="eyebrow" style="margin-top:6px">Hi ${esc(h.user.name.split(' ')[0])}</div>
    ${m ? `<div class="card hot"><div class="eyebrow">${m.status === 'finished' ? 'Meso complete' : 'Current meso'}</div><div class="h1">${esc(m.name)}</div>
      <p class="muted" style="margin:6px 0 12px">${m.done} workouts done, ${m.skipped} skipped. ${m.status === 'finished' ? 'Nice work. Your next meso can start from this one.' : ''}</p>
      <div class="row"><a class="btn grow" href="summary/${m.id}" data-link>Summary</a><a class="btn primary grow" href="new/copy/${m.id}" data-link>${icon('copy')} Start next meso</a></div></div>`
    : `<div class="card hot"><div class="h1">Welcome to Jones Hypertrophy</div><p class="muted">Start your first meso: copy a past one, pick a template, or build your own.</p><a class="btn primary block" href="new" data-link>${icon('plus')} New meso</a></div>`}
    ${h.recentPRs.length ? `<div class="section">Recent PRs</div><div class="card">${h.recentPRs.map((p) => `<div class="list-item"><div class="grow"><div style="font-weight:700">${esc(p.name)}</div><div class="sub">${esc(p.type)} · ${fmtDate(p.at)}</div></div><div style="font-weight:800">${esc(p.text)}</div></div>`).join('')}</div>` : ''}
    ${h.last ? `<div class="section">Last workout</div><div class="card"><div style="font-weight:700">${esc(h.last.label)} · Week ${h.last.week}</div><div class="sub">${esc(h.last.name)} · ${fmtDate(h.last.finished_at)} · ${h.last.sets} sets</div></div>` : ''}`;
}

// ---------- workout ----------
let W = null; // current workout data
let openId = null; let expandAll = false; let chimedFor = null;

export async function workout(id, { replaceRoute = false } = {}) {
  const my = seq();
  const data = await api.get(`workouts/${id}`);
  if (my !== seq()) return;
  if (replaceRoute) history.replaceState({}, '', `workout/${id}`);
  if (!W || W.id !== data.id) { openId = null; expandAll = false; }
  W = data;
  draw();
  startTimer();
}
async function reload() { const d = await api.get(`workouts/${W.id}`); W = d; draw(); }

const workSets = (x) => x.sets;
const isOpenSet = (s) => !s.done && !s.skipped;
const exDone = (x) => x.sets.every((s) => !isOpenSet(s));
function pickOpen() {
  if (openId === -1) return null;
  if (openId && W.exercises.some((x) => x.id === openId)) return openId;
  const x = W.exercises.find((e) => !exDone(e));
  return x ? x.id : null;
}

function header() {
  const date = W.status === 'pending' ? new Date() : new Date(W.finished_at || Date.now());
  const dayTxt = `Week ${W.week} of ${W.weeks} · Day ${W.dayPos + 1} · ${date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`;
  return `<div class="wk-head" style="margin-top:2px">
    <div class="grow"><div class="h1 ell">${esc(W.label)}</div><div class="sub">${dayTxt}</div></div>
    <span class="pill amber">${W.isDeload ? 'Deload' : `Target ${rirText(W.rir)}`}</span>
    <button class="icon-btn" id="wmenu" aria-label="Workout menu">${icon('more', 20)}</button></div>`;
}

function draw() {
  const el = app();
  if (!W.unlocked) {
    el.innerHTML = `${header()}<div class="card"><div class="h2">Not unlocked yet</div><p class="muted" style="margin:6px 0 0">Workouts go in order. This one opens after you finish or skip the ones before it.</p></div>
      ${W.exercises.length ? `<div class="section">Planned</div>${W.exercises.map((x) => `<div class="ex"><div class="ex-head"><div class="stripe" style="background:${mColor(x.muscle)}"></div><div class="grow"><div class="ex-name ell">${esc(x.exercise.name)}</div><div class="ex-meta"><span class="tag" style="color:${mColor(x.muscle)}">${esc(x.muscle)}</span> · ${esc(x.exercise.equipment)}</div></div></div></div>`).join('')}<p class="sub">Sets and weights fill in from the week before, once it's done.</p>` : ''}
      <a class="btn block" href="meso/${W.mesoId}" data-link>${icon('calendar')} Meso calendar</a>`;
    bindHeader();
    return;
  }
  const open = pickOpen();
  const parts = [header()];
  if (W.status === 'done') parts.push(`<div class="strip green" style="margin:0">Done ${fmtDate(W.finished_at)}${W.firstSetAt && W.lastSetAt ? ` · ${Math.round((W.lastSetAt - W.firstSetAt) / 60000)} min` : ''}</div>`);
  if (W.status === 'skipped') parts.push('<div class="strip" style="margin:0">Skipped. Log a set to bring it back.</div>');
  if (W.status === 'pending' && W.lastSetAt) parts.push('<div class="timer" id="timer"></div>');
  for (const n of W.notes) parts.push(`<div class="pinned">${icon('note', 14)} ${esc(n.text)}</div>`);
  const muscles = W.exercises.map((x) => x.muscle);
  W.exercises.forEach((x, i) => {
    parts.push(exCard(x, expandAll || x.id === open, i));
    // check-in after the last exercise of a muscle, once all its sets are logged
    const lastOfMuscle = muscles.lastIndexOf(x.muscle) === i;
    if (lastOfMuscle && !W.isDeload && W.status !== 'skipped') {
      const all = W.exercises.filter((e) => e.muscle === x.muscle);
      const finished = all.every(exDone) && all.some((e) => e.sets.some((s) => s.done));
      const has = W.checkins.find((c) => c.muscle === x.muscle);
      if (finished && (!has || has.editing)) parts.push(checkinCard(x.muscle, has));
    }
  });
  const allDone = W.exercises.length && W.exercises.every(exDone);
  if (W.status === 'pending') {
    parts.push(`<div class="foot">${allDone ? `<button class="btn primary grow" id="finish">${icon('check')} Finish workout</button>` : `<button class="btn grow" id="expand">${expandAll ? 'Collapse' : 'Expand all'}</button><button class="btn grow" id="addex">${icon('plus')} Exercise</button>`}</div>`);
  }
  if (!W.exercises.length) parts.push('<div class="empty">No exercises yet. Add one with the button above.</div>');
  el.innerHTML = parts.join('');
  bindHeader();
  bindWorkout();
  tickTimer();
}

function exCard(x, isOpen, idx) {
  const done = x.sets.filter((s) => s.done).length; const total = x.sets.filter((s) => s.kind !== 'warmup').length;
  const workDone = x.sets.filter((s) => s.done && s.kind !== 'warmup').length;
  const color = mColor(x.muscle);
  const meta = `<span class="tag" style="color:${color}">${esc(x.muscle)} · ${esc(PRIORITY[x.priority] || '')}</span> · ${esc(x.exercise.equipment)}${x.bodyweight ? ` · BW ${fmtW(x.bodyweight)}` : ''}`;
  if (!isOpen) {
    return `<div class="ex" data-x="${x.id}"><button class="ex-head" data-toggle="${x.id}"><div class="stripe" style="background:${color}"></div>
      <div class="grow"><div class="ex-name ell">${esc(x.exercise.name)}</div><div class="ex-meta">${meta}</div></div>
      <div class="count ${exDone(x) ? 'done' : ''}">${workDone} / ${total}</div>${icon('down', 16)}</button></div>`;
  }
  const s0 = ctx.settings;
  const units = s0.units;
  const firstOpen = x.sets.find(isOpenSet);
  const repTarget = x.sets.find((s) => s.kind !== 'warmup' && s.target_reps)?.target_reps;
  const strips = [];
  if (x.pinned.length) strips.push(...x.pinned.map((n) => `<div class="pinned">${icon('note', 14)} ${esc(n.text)}</div>`));
  if (x.joint_pain === 'flagged' || x.joint_pain === 'painful') strips.push(`<div class="strip red">${icon('flame', 14)} Joints hurt on this last time. Consider a swap. <button class="link-btn" data-replace="${x.id}" style="padding:0">Replace</button></div>`);
  if (x.suggestion && x.suggestion.text && !x.sets.some((s) => s.done)) {
    const g = x.suggestion;
    strips.push(`<div class="strip blue"><span>${esc(g.label)}${g.confidence === 'hint' && g.weight != null ? `: about ${fmtW(g.weight)} × ${g.reps}` : ''}</span><span class="muted">${esc(g.text)}</span></div>`);
  }
  const target = W.isDeload ? 'Deload: light and easy' : `Target: ${repTarget ? `${repTarget} reps at ` : ''}${rirText(W.rir)}`;
  const cur = firstOpen && (firstOpen.weight ?? firstOpen.target_weight);
  const range = firstOpen && firstOpen.range_low != null && firstOpen.kind !== 'warmup' && firstOpen.kind !== 'attempt' ? ` · range ${fmtW(firstOpen.range_low)}–${fmtW(firstOpen.range_high)}` : '';
  strips.push(`<div class="strip">${esc(target)}<span class="muted">· ${esc(rirHint(W.rir))}${range}</span></div>`);
  if (x.why && x.sets.every((s) => !s.done)) strips.push(`<div class="sub" style="margin:4px 2px 0">${esc(x.why)}</div>`);
  const plateTxt = x.model.kind === 'plates' && cur != null ? E.platesText(E.platesPerSide(cur, x.model)) : '';
  if (plateTxt && firstOpen && firstOpen.kind !== 'warmup' && firstOpen.kind !== 'attempt') strips.push(`<div class="sub" style="margin:4px 2px 0">Plates per side for ${fmtW(cur)}: <b>${esc(plateTxt)}</b> on a ${fmtW(x.model.bar)} ${units} bar</div>`);
  let n = 0;
  const rows = x.sets.map((s) => {
    const isWork = s.kind !== 'warmup' && s.kind !== 'attempt';
    if (isWork) n++;
    const w = s.weight ?? s.target_weight; const r = s.reps ?? s.target_reps;
    const isCur = firstOpen && s.id === firstOpen.id && W.status === 'pending';
    const label = s.kind === 'warmup' ? `W<small>${s.pct}%</small>` : s.kind === 'attempt' ? `1RM<small>${s.pct}%</small>` : `${n}${s.kind === 'myo' ? '<small data-setinfo="myo">myo ⓘ</small>' : s.kind === 'myomatch' ? '<small data-setinfo="myomatch">match ⓘ</small>' : ''}`;
    const tr = s.trend ? `<span class="trend ${s.trend}">${icon(s.trend === 'up' ? 'tUp' : s.trend === 'down' ? 'tDown' : 'tFlat', 14, 3)}</span>` : '';
    const wTxt = x.model.kind === 'none' ? 'BW' : w == null ? '<span class="muted">—</span>' : fmtW(w);
    const rTxt = s.kind === 'attempt' && s.done ? (s.result === 'made' ? 'Made' : 'Missed') : r == null ? `<span class="muted" style="font-size:13px">${W.isDeload ? '' : rirText(W.rir)}</span>` : r;
    const last = s.last ? `${x.model.kind === 'none' ? '' : `${fmtW(s.last.weight)}×`}${s.last.reps}` : '';
    const logBtn = s.done ? `<button class="log done" data-undo="${s.id}" aria-label="Logged. Tap to undo">${icon('check', 16, 3)}</button>`
      : s.skipped ? `<button class="log skip" data-unskip="${s.id}">SKIP</button>`
        : s.kind === 'attempt' ? '<span></span>' : `<button class="log" data-log="${s.id}">LOG</button>`;
    const showPlates = (s.kind === 'warmup' || s.kind === 'attempt') && s.plates;
    const fb = s === x.sets[0] && W.status === 'pending' && feedbackDue(x.muscle) ? `<button class="fb-req" data-askfb="${esc(x.muscle)}">${icon('info', 16, 2.4)} Your feedback is required</button>` : '';
    let html = `<div class="set ${s.skipped ? 'skipped' : ''}${fb ? ' has-fb' : ''}" data-s="${s.id}">${fb}<div class="n">${label}</div>
      <button class="cell ${s.weight == null && !s.done ? 'target' : ''} ${isCur ? 'cur' : ''}" data-edit="${s.id}" data-field="w">${wTxt}</button>
      <button class="cell ${s.reps == null && !s.done ? 'target' : ''} ${isCur ? 'cur' : ''}" data-edit="${s.id}" data-field="r">${rTxt}${tr}</button>
      <div class="last">${esc(last)}</div>${logBtn}<button class="dots" data-smenu="${s.id}" aria-label="Set menu">${icon('more', 16)}</button></div>`;
    if (showPlates) html += `<div class="set" style="padding:0"><div></div><div class="plates">${esc(E.platesText(s.plates))} per side${s.rest && !s.done ? ` · rest ${E.clock(s.rest)}` : ''}</div><div></div><div></div><div></div></div>`;
    if (s.kind === 'attempt' && !s.done && W.status === 'pending') html += `<div class="attempt-row"><button class="btn green small grow" data-made="${s.id}">Made it</button><button class="btn small grow" data-missed="${s.id}">Missed</button></div>`;
    if (s.kind === 'attempt' && s.done && s.result === 'made' && s === x.sets.filter((q) => q.kind === 'attempt').at(-1) && W.status === 'pending') html += `<div class="attempt-row"><button class="btn small grow" data-another="${s.id}">${icon('bolt')} Try another? (+${fmtW(E.nextAttempt(s.weight, x.model, ctx.settings.minJump) - s.weight)})</button></div>`;
    return html;
  }).join('');
  const notes = x.notes.map((nn) => `<div class="sub" style="margin:4px 0 0 30px;color:var(--amber)">Note: ${esc(nn.text)}</div>`).join('');
  return `<div class="ex open" data-x="${x.id}">
    <div class="ex-head"><div class="stripe" style="background:${color};height:30px"></div>
      <button class="grow" data-toggle="${x.id}" style="border:0;background:none;text-align:left;padding:0;min-width:0"><div class="ex-name ell">${esc(x.exercise.name)}</div><div class="ex-meta">${meta}</div></button>
      <a class="icon-btn amber" href="exercise/${x.exercise.id}?tab=howto" data-link aria-label="How to">${icon('book', 17)}</a>
      <a class="icon-btn amber" href="exercise/${x.exercise.id}?tab=history" data-link aria-label="History">${icon('clock', 17)}</a>
      <button class="icon-btn" data-xmenu="${x.id}" aria-label="Exercise menu">${icon('more', 17)}</button></div>
    ${strips.join('')}
    <div class="set-hd"><div>SET</div><div>${x.model.kind === 'none' ? '' : x.model.bodyweight === 'assist' ? 'ASSIST' : x.model.bodyweight === 'plus' ? `+${units.toUpperCase()}` : units.toUpperCase()}</div><div>REPS</div><div>LAST</div><div></div><div></div></div>
    ${rows}${notes}</div>`;
}

function checkinCard(muscle, prev) {
  const v = prev || {};
  const seg = (k, opts) => `<div class="seg" data-k="${k}">${opts.map(([val, label]) => `<button type="button" data-v="${val}" class="${v[k] === val ? 'on' : ''}">${label}</button>`).join('')}</div>`;
  return `<div class="check" data-check="${esc(muscle)}"><h3>How did ${esc(muscle.toLowerCase())} feel?</h3>
    <div class="q">Pump</div>${seg('pump', [['low', 'Low'], ['good', 'Good'], ['great', 'Great']])}
    <div class="q">Workload</div>${seg('workload', [['easy', 'Easy'], ['right', 'About right'], ['pushed', 'Pushed hard'], ['too_much', 'Too much']])}
    <div class="q">Joints</div>${seg('joints', [['fine', 'Fine'], ['some', 'Some discomfort'], ['painful', 'Painful']])}
    <button class="btn primary block" style="margin-top:10px" data-savecheck="${esc(muscle)}">Save check-in</button></div>`;
}
// Asked as a pop-up when you log the first set for a muscle in this workout. Tapping away logs that
// set, then a red "feedback is required" badge blocks the muscle's other sets until you answer.
function askSoreness(muscle, checkinId) {
  return new Promise((resolve) => {
    let picked = false;
    sheet(`<div class="eyebrow">${esc(muscle)}</div><div class="h2">How's your ${esc(muscle.toLowerCase())} from last time?</div>
      <p class="sub" style="margin:4px 0 12px">Soreness since your last ${esc(muscle.toLowerCase())} session. It helps set next week's sets.</p>
      <div class="menu">${[['never', 'Never got sore'], ['early', 'Healed a while ago'], ['on_time', 'Healed just in time'], ['sore', 'Still sore']].map(([v, l]) => `<button data-sv="${v}"><span>${l}</span></button>`).join('')}</div>`, {
      onMount: (el, close) => el.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-sv]'); if (!b) return;
        if (b.dataset.sv) {
          picked = true; close();
          try { await api.queued('POST', `checkins/${checkinId}/soreness`, { value: b.dataset.sv }); if (W.soreness[muscle]) W.soreness[muscle].answer = b.dataset.sv; } catch (err) { toast(err.message); }
          resolve(true);
        }
      }),
      onClose: () => { if (!picked) resolve(false); }, // closing without an answer doesn't log the set
    });
  });
}
function needsSoreness(x) {
  const sore = W.soreness && W.soreness[x.muscle];
  if (!sore || sore.answer) return null;
  return sore;
}
// After the first set of a muscle is logged, an unanswered soreness question blocks that muscle's other sets
const muscleStarted = (muscle) => W.exercises.some((e) => e.muscle === muscle && e.sets.some((q) => q.done));
const feedbackDue = (muscle) => { const so = W.soreness && W.soreness[muscle]; return !!(so && !so.answer && muscleStarted(muscle)); };
function sorenessCard(muscle, checkinId) {
  return `<div class="check" style="margin-top:6px"><h3>How's your ${esc(muscle.toLowerCase())} from last time?</h3>
    <div class="seg" data-sore="${checkinId}">${[['never', 'Never got sore'], ['early', 'Healed a while ago'], ['on_time', 'Healed just in time'], ['sore', 'Still sore']].map(([v, l]) => `<button type="button" data-v="${v}">${l}</button>`).join('')}</div></div>`;
}

// ---------- timer ----------
function startTimer() {
  if (window.__jhTimer) clearInterval(window.__jhTimer);
  window.__jhTimer = setInterval(tickTimer, 1000);
}
function restGoal() {
  if (!W.lastSet) return 0;
  if (W.lastSet.rest) return W.lastSet.rest;
  const x = W.exercises.find((e) => e.id === W.lastSet.wex_id);
  return x ? x.rest_goal : ctx.settings.restIsolation;
}
function tickTimer() {
  const el = document.getElementById('timer');
  if (!el || !W.lastSetAt) return;
  const goal = restGoal();
  const st = E.restState(W.lastSetAt, Date.now(), goal);
  const total = W.firstSetAt ? E.clock((Date.now() - W.firstSetAt) / 1000) : '';
  el.className = `timer ${st.reached ? 'go' : ''}`;
  el.innerHTML = `<span style="color:${st.reached ? 'var(--green-t)' : 'var(--amber)'}">${icon('timer', 20, 2.4)}</span><div class="big">${E.clock(st.elapsed)}</div>
    <div class="grow"><div class="lbl">since last set${goal ? ` · goal ${E.clock(goal)}` : ''}${st.reached ? ' · go when ready' : ''}</div><div class="bar"><i style="width:${Math.round(st.pct * 100)}%"></i></div></div>
    <div class="sub num" style="text-align:right">total<br>${total}</div>`;
  const key = `${W.lastSetAt}`;
  if (st.reached && chimedFor !== key && st.elapsed < goal + 5) { chimedFor = key; if (ctx.settings.chime) chime(); }
  if (!st.reached) chimedFor = null;
}

// ---------- actions ----------
function findSet(id) { for (const x of W.exercises) { const s = x.sets.find((q) => q.id === id); if (s) return { x, s }; } return {}; }
function afterLog(res) { if (res && res.pr) celebrate(res.pr); }
async function logSet(id, values) {
  const { x, s } = findSet(id);
  const weight = values.weight !== undefined ? values.weight : (s.weight ?? s.target_weight);
  const reps = values.reps !== undefined ? values.reps : (s.reps ?? s.target_reps);
  if (reps == null) return editSet(id);
  if (x.model.kind !== 'none' && weight == null) return editSet(id);
  // an owed "feedback is required" answer (any muscle) blocks logging any other set until it's given
  const owed = Object.keys(W.soreness || {}).find((m) => feedbackDue(m));
  if (owed && !s.done) {
    const answered = await askSoreness(owed, W.soreness[owed].checkinId);
    if (!answered) { toast(`Answer the ${owed.toLowerCase()} question first`); draw(); return; }
  }
  const sore = needsSoreness(x);
  if (sore) {
    const answered = await askSoreness(x.muscle, sore.checkinId);
    // tapping away still logs the muscle's first set; after that the answer is required
    if (!answered && muscleStarted(x.muscle)) { draw(); return; }
  }
  const at = Date.now();
  const res = await api.queued('PUT', `sets/${id}`, { weight: x.model.kind === 'none' ? null : weight, reps, done: true, at });
  if (res.queued) {
    // apply here so the phone keeps working without signal
    Object.assign(s, { weight, reps, done: 1, skipped: 0, logged_at: at });
    W.lastSetAt = at; W.firstSetAt = W.firstSetAt || at; W.lastSet = { logged_at: at, rest: s.rest, wex_id: x.id };
    if (exDone(x)) openId = null;
    draw(); return;
  }
  afterLog(res);
  if (exDone(x)) openId = null;
  window.__jhKeepScroll = true;
  await reload();
}
function stepFor(x) {
  const m = x.model;
  if (m.kind === 'plates') return 2 * Math.min(...ctx.settings.plates);
  return m.step || 1;
}
// field: 'w' = only the weight, 'r' = only the reps, null = both (used when logging needs both)
function editSet(id, field = null) {
  const { x, s } = findSet(id);
  if (!s) return;
  const units = ctx.settings.units;
  let w = s.weight ?? s.target_weight ?? (x.model.kind === 'plates' ? x.model.bar : null);
  let r = s.reps ?? s.target_reps ?? null;
  const step = stepFor(x);
  const noW = x.model.kind === 'none';
  if (noW && field === 'w') field = 'r';
  const showW = !noW && field !== 'r';
  const showR = field !== 'w';
  const plates = () => (x.model.kind === 'plates' && w != null ? (() => { const p = E.platesPerSide(w, x.model); return p ? `${E.platesText(p)} per side` : `Can't be loaded exactly with your plates (nearest ${fmtW(E.roundLoad(w, x.model))})`; })() : '');
  const wLabel = x.model.bodyweight === 'assist' ? 'Assistance' : x.model.bodyweight === 'plus' ? 'Added weight' : 'Weight';
  const isWork = s.kind !== 'warmup' && s.kind !== 'attempt';
  // Until you set reps yourself, the rep target follows the weight so the effort stays at this week's RIR
  let repsTouched = !!(s.done || s.reps != null);
  const plan = isWork && s.target_weight != null && (s.plan_reps ?? s.target_reps) ? { weight: s.target_weight, reps: s.plan_reps ?? s.target_reps } : null;
  const followed = () => (repsTouched || !plan || w == null ? null : E.repsAt(plan, w, W.rir, x.model, x.bodyweight));
  const repsNote = () => { const n = followed(); return n != null && n !== plan.reps ? `Rep target at ${fmtW(w)} ${units}: ${n} reps (same effort, ${rirText(W.rir)})` : ''; };
  const one = field !== null;
  sheet(`<div class="eyebrow">${s.kind === 'warmup' ? `Warm-up · ${s.pct}%` : s.kind === 'attempt' ? '1RM attempt' : `Set ${x.sets.filter((q) => q.kind !== 'warmup' && q.kind !== 'attempt').indexOf(s) + 1}`}</div>
    <div class="h2 ell">${esc(x.exercise.name)}</div>
    <div class="sub" style="margin:2px 0 10px">${plan ? `Plan ${fmtW(plan.weight)} × ${plan.reps} · ` : ''}${rirText(W.rir)}${s.last ? ` · last ${s.last.weight != null ? `${fmtW(s.last.weight)} × ` : ''}${s.last.reps}` : ''}</div>
    ${noW && showR && !one ? `<div class="sub" style="margin-bottom:8px">Bodyweight${x.bodyweight ? ` (${fmtW(x.bodyweight)} ${units})` : ''}. Log your reps.</div>` : ''}
    ${showW ? `<div class="lab">${wLabel} (${units})</div>
    <div class="stepper" style="margin:4px 0 4px"><button data-w="-1" aria-label="Less weight">−</button><input id="ew" inputmode="decimal" value="${w == null ? '' : fmtW(w)}"><button data-w="1" aria-label="More weight">+</button></div>
    <div class="sub" id="eplates" style="min-height:16px;margin-bottom:4px">${esc(plates())}</div>
    ${field === 'w' ? `<div class="sub" id="ereps" style="min-height:16px;margin-bottom:10px;color:var(--amber)">${esc(repsNote())}</div>` : ''}` : ''}
    ${showR ? `<div class="lab">Reps</div>
    <div class="stepper" style="margin:4px 0 14px"><button data-r="-1" aria-label="Fewer reps">−</button><input id="er" inputmode="numeric" value="${r == null ? '' : r}" placeholder="reps"><button data-r="1" aria-label="More reps">+</button></div>` : ''}
    <div class="row">${one ? `<button class="btn primary grow" data-save>Save</button>` : `<button class="btn grow" data-save>Save</button><button class="btn primary grow" data-logit>${s.done ? 'Update' : 'Log set'}</button>`}</div>`, {
    onMount: (el, close) => {
      const ew = el.querySelector('#ew'); const er = el.querySelector('#er');
      const upd = () => {
        const p = el.querySelector('#eplates'); if (p) p.textContent = plates();
        const n = el.querySelector('#ereps'); if (n) n.textContent = repsNote();
        const f = followed(); if (er && f != null) { r = f; er.value = f; }
      };
      $$('[data-w]', el).forEach((btn) => btn.addEventListener('click', () => { const cur = Number(ew.value) || 0; w = Math.max(0, Math.round((cur + Number(btn.dataset.w) * step) * 100) / 100); ew.value = fmtW(w); upd(); }));
      $$('[data-r]', el).forEach((btn) => btn.addEventListener('click', () => { repsTouched = true; r = Math.max(0, (Number(er.value) || 0) + Number(btn.dataset.r)); er.value = r; }));
      if (ew) ew.addEventListener('input', () => { w = ew.value === '' ? null : Number(ew.value); upd(); });
      if (er) er.addEventListener('input', () => { repsTouched = true; r = er.value === '' ? null : Number(er.value); });
      if (field === 'r' && er) setTimeout(() => { er.focus(); er.select(); }, 50);
      if (field === 'w' && ew) setTimeout(() => { ew.focus(); ew.select(); }, 50);
      const wVal = () => (noW ? null : ew ? (ew.value === '' ? null : Number(ew.value)) : w);
      const rVal = () => (er ? (er.value === '' ? null : Math.round(Number(er.value))) : r);
      const vals = () => {
        if (field === 'w') return { weight: wVal() }; // reps stay as they were (an unlogged target follows the weight)
        if (field === 'r') return { reps: rVal() };
        return { weight: wVal(), reps: rVal() };
      };
      el.querySelector('[data-save]').onclick = async () => {
        const v = vals();
        if (field === 'r' && s.done && (v.reps == null || (v.reps < 1 && s.kind !== 'attempt'))) { toast('Enter the reps'); return; }
        close(); try { await api.queued('PUT', `sets/${id}`, v); await reload(); } catch (e) { toast(e.message); }
      };
      const lg = el.querySelector('[data-logit]');
      if (lg) lg.onclick = async () => {
        const v = vals();
        if (v.reps == null || (v.reps < 1 && s.kind !== 'attempt')) { toast('Enter the reps'); return; }
        close();
        try { if (s.done) { await api.put(`sets/${id}`, v); await reload(); } else await logSet(id, v); } catch (e) { toast(e.message); }
      };
    },
  });
}

// Tap the weight or the reps in a set row and type the number right there.
// Enter or tapping away saves; Escape cancels. Changing an unlogged weight moves its rep target
// so the effort stays at this week's RIR (the server works that out).
function inlineEdit(btn, id, field) {
  const { x, s } = findSet(id);
  if (!s) return;
  if (field === 'w' && x.model.kind === 'none') field = 'r';
  const cur = field === 'w' ? (s.weight ?? s.target_weight) : (s.reps ?? s.target_reps);
  const cell = field === 'w' ? btn : btn.closest('.set').querySelector('[data-field="r"]');
  const inp = document.createElement('input');
  inp.className = 'cell cur';
  inp.inputMode = field === 'w' ? 'decimal' : 'numeric';
  inp.type = 'text';
  inp.autocomplete = 'off';
  inp.setAttribute('enterkeyhint', 'done');
  inp.setAttribute('aria-label', field === 'w' ? 'Weight' : 'Reps');
  inp.value = cur == null ? '' : field === 'w' ? fmtW(cur) : String(cur);
  inp.style.textAlign = 'center';
  cell.replaceWith(inp);
  inp.focus(); inp.select();
  let finished = false;
  const finish = async (save) => {
    if (finished) return; finished = true;
    const raw = inp.value.trim().replace(',', '.');
    window.__jhKeepScroll = true;
    if (!save || raw === '' || raw === (cur == null ? '' : field === 'w' ? fmtW(cur) : String(cur))) { draw(); return; }
    const v = Number(raw);
    if (!isFinite(v) || v < 0) { toast(field === 'w' ? 'Check the weight' : 'Check the reps'); draw(); return; }
    const body = field === 'w' ? { weight: v } : { reps: Math.round(v) };
    if (field === 'r' && s.done && body.reps < 1 && s.kind !== 'attempt') { toast('Enter the reps'); draw(); return; }
    try {
      const res = await api.queued('PUT', `sets/${id}`, body);
      if (res && res.queued) { Object.assign(s, body); draw(); return; }
      window.__jhKeepScroll = true;
      await reload();
    } catch (e) { toast(e.message); draw(); }
  };
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
    if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  inp.addEventListener('blur', () => finish(true));
}

function bindHeader() {
  const b = document.getElementById('wmenu');
  if (b) b.onclick = workoutMenu;
}
function bindWorkout() {
  const el = app();
  el.onclick = async (e) => {
    const si = e.target.closest('[data-setinfo]');
    if (si) { const inf = SET_INFO[si.dataset.setinfo]; return infoSheet(inf.title, inf.html); }
    const t = e.target.closest('button, [data-v]');
    if (!t) return;
    const d = t.dataset;
    try {
      if (d.toggle) { const id = Number(d.toggle); openId = pickOpen() === id && !expandAll ? -1 : id; expandAll = false; draw(); return; }
      if (d.askfb) { const so = W.soreness[d.askfb]; if (so && (await askSoreness(d.askfb, so.checkinId))) draw(); return; }
      if (d.log) return await logSet(Number(d.log), {});
      if (d.edit) return d.field ? inlineEdit(t, Number(d.edit), d.field) : editSet(Number(d.edit));
      if (d.undo) { const ok = await confirmSheet('Undo this set?', 'It will go back to not logged.', { ok: 'Undo' }); if (ok) { await api.put(`sets/${d.undo}`, { done: false }); await reload(); } return; }
      if (d.unskip) { await api.post(`sets/${d.unskip}/action`, { action: 'unskip' }); await reload(); return; }
      if (d.smenu) return setMenu(Number(d.smenu));
      if (d.xmenu) return exMenu(Number(d.xmenu));
      if (d.replace) return replaceFlow(Number(d.replace));
      if (d.made || d.missed) { const res = await api.post(`sets/${d.made || d.missed}/action`, { action: 'attempt', made: !!d.made }); afterLog(res); if (d.made) toast('Made it! Recorded as a tested 1RM.'); await reload(); return; }
      if (d.another) { await api.post(`sets/${d.another}/action`, { action: 'another' }); await reload(); return; }
      if (t.id === 'finish') return finish();
      if (t.id === 'expand') { expandAll = !expandAll; draw(); return; }
      if (t.id === 'addex') return addExercise();
      if (d.v && t.parentElement.dataset.k) { $$('button', t.parentElement).forEach((q) => q.classList.toggle('on', q === t)); return; }
      if (d.v && t.parentElement.dataset.sore) { await api.post(`checkins/${t.parentElement.dataset.sore}/soreness`, { value: d.v }); toast('Thanks. That steers next week\'s sets.'); await reload(); return; }
      if (d.savecheck) {
        const card = t.closest('.check');
        const val = (k) => card.querySelector(`[data-k="${k}"] .on`)?.dataset.v;
        if (!val('pump') || !val('workload')) { toast('Pick pump and workload'); return; }
        await api.post(`workouts/${W.id}/checkin`, { muscle: d.savecheck, pump: val('pump'), workload: val('workload'), joints: val('joints') || 'fine' });
        toast('Check-in saved'); await reload(); return;
      }
    } catch (err) { toast(err.message); }
  };
}

async function finish() {
  try {
    await api.post(`workouts/${W.id}/action`, { action: 'finish' });
  } catch (e) {
    if (e.status === 409 && /not logged/.test(e.message)) {
      if (!(await confirmSheet('Finish anyway?', `${e.message}. They'll be marked as skipped.`, { ok: 'Finish' }))) return;
      await api.post(`workouts/${W.id}/action`, { action: 'finish', force: true });
    } else { toast(e.message); return; }
  }
  const mins = W.firstSetAt && W.lastSetAt ? Math.round((W.lastSetAt - W.firstSetAt) / 60000) : null;
  toast(`Workout done${mins ? ` in ${mins} min` : ''}. Nice work!`);
  const h = await loadHome();
  if (h.next) go(`workout/${h.next.id}`); else go(`summary/${W.mesoId}`);
}

// ---------- set type explainers ----------
const SET_INFO = {
  myo: { title: 'Myo-reps', html: `<p>A way to get a lot of hard reps in very little time.</p>
    <ol><li><b>Activation set:</b> pick a weight you can do about 12 to 20 times and go to 1 to 2 reps short of failure.</li>
    <li><b>Rest about 15 seconds</b> (3 to 5 deep breaths).</li>
    <li><b>Mini-sets:</b> same weight, 3 to 5 reps, rest 15 seconds, repeat.</li>
    <li><b>Stop</b> when you can't get 3 reps, or after about 5 mini-sets.</li></ol>
    <p>Log the weight and the <b>total reps</b> of the whole thing (activation set plus all mini-sets).</p>
    <p class="sub">Best on safe, isolation-type moves (curls, raises, pushdowns, machines). Skip it on heavy squats and deadlifts.</p>` },
  myomatch: { title: 'Myo-rep match', html: `<p>Comes right after a myo-reps set and matches it.</p>
    <ol><li>Use the <b>same weight</b> as the myo-reps set above it.</li>
    <li>Your goal is the <b>same total reps</b> that set got.</li>
    <li>Do as many as you can, rest about 15 seconds (3 to 5 deep breaths), and keep going in short bursts until you hit that total.</li></ol>
    <p>Log the weight and the total reps you reached.</p>` },
};

// ---------- menus ----------
function setMenu(id) {
  const { x, s } = findSet(id);
  menu(`<div class="eyebrow">Set</div>${esc(x.exercise.name)}`, [
    { label: 'Add a set below', icon: 'plus', run: () => act(`sets/${id}/action`, { action: 'addBelow' }) },
    ...(x.model.kind !== 'none' && !x.model.bodyweight && s.kind !== 'warmup' && s.kind !== 'attempt' ? [{ label: 'Test 1RM instead', sub: 'warm-ups to your max', icon: 'bolt', run: () => test1rm(x, s) }] : []),
    { group: 'Set type' },
    { label: 'Regular', sub: s.kind === 'regular' ? 'current' : '', run: () => act(`sets/${id}/action`, { action: 'type', kind: 'regular' }) },
    { label: 'Myo-reps', sub: s.kind === 'myo' ? 'current' : '', info: SET_INFO.myo, run: () => act(`sets/${id}/action`, { action: 'type', kind: 'myo' }) },
    { label: 'Myo-rep match', sub: s.kind === 'myomatch' ? 'current' : 'after a myo-reps set', info: SET_INFO.myomatch, run: () => act(`sets/${id}/action`, { action: 'type', kind: 'myomatch' }) },
    { group: ' ' },
    { label: s.skipped ? 'Unskip set' : 'Skip set', icon: 'skip', run: () => act(`sets/${id}/action`, { action: s.skipped ? 'unskip' : 'skip' }) },
    { label: 'Delete set', icon: 'trash', danger: true, run: () => act(`sets/${id}/action`, { action: 'delete' }) },
  ]);
}
async function act(url, body) { try { const r = await api.post(url, body); afterLog(r); await reload(); } catch (e) { toast(e.message); } }

function exMenu(id) {
  const x = W.exercises.find((e) => e.id === id);
  const idx = W.exercises.indexOf(x);
  menu(`<div class="eyebrow">Exercise</div>${esc(x.exercise.name)}`, [
    { label: 'Add a note', sub: 'or pin it to show every time', icon: 'note', run: async () => {
      const v = await promptSheet('Note', { placeholder: 'Seat on 4, pause on chest...', multiline: true, extra: '<label class="toggle" style="margin-top:8px"><span>Pin it: show every time this exercise comes up</span><span class="switch"><input type="checkbox" data-x="pinned" checked><span></span></span></label>' });
      if (v && v.value) act(`wex/${id}/action`, { action: 'note', text: v.value, pinned: v.pinned });
    } },
    ...(idx > 0 ? [{ label: 'Move up', icon: 'up', run: () => act(`wex/${id}/action`, { action: 'move', dir: 'up' }) }] : []),
    ...(idx < W.exercises.length - 1 ? [{ label: 'Move down', icon: 'down', run: () => act(`wex/${id}/action`, { action: 'move', dir: 'down' }) }] : []),
    { label: 'Replace', sub: 'similar ones first', icon: 'swap', run: () => replaceFlow(id) },
    { label: 'Joint pain', sub: x.joint_pain ? (x.joint_pain === 'some' ? 'some' : 'flagged') : '', icon: 'flame', run: () => menu('Joint pain on this exercise?', [
      { label: 'None', run: () => act(`wex/${id}/action`, { action: 'joint', value: null }) },
      { label: 'Some discomfort', run: () => act(`wex/${id}/action`, { action: 'joint', value: 'some' }) },
      { label: 'Painful (suggest a swap next time)', run: () => act(`wex/${id}/action`, { action: 'joint', value: 'painful' }) },
    ]) },
    { label: 'Add a set', icon: 'plus', run: () => act(`wex/${id}/action`, { action: 'addSet' }) },
    { label: 'Rest goal', sub: E.clock(x.rest_goal), icon: 'timer', run: () => restGoalSheet(x) },
    { label: 'Skip remaining sets', icon: 'skip', run: () => act(`wex/${id}/action`, { action: 'skipRest' }) },
    { label: 'Remove exercise', icon: 'trash', danger: true, run: async () => { if (await confirmSheet('Remove this exercise?', 'It comes out of this workout and the ones after it in this meso.', { ok: 'Remove', danger: true })) act(`wex/${id}/action`, { action: 'remove' }); } },
  ]);
}
function restGoalSheet(x) {
  let v = x.rest_goal;
  sheet(`<div class="h2">Rest goal</div><p class="sub">The timer turns green when you've rested this long${ctx.settings.chime ? ' and chimes' : ''}.</p>
    <div class="stepper" style="margin:10px 0 14px"><button data-d="-15">−</button><input id="rg" readonly value="${E.clock(v)}"><button data-d="15">+</button></div>
    <button class="btn primary block" data-ok>Save for this meso</button>`, {
    onMount: (el, close) => {
      $$('[data-d]', el).forEach((b) => b.onclick = () => { v = Math.max(15, Math.min(900, v + Number(b.dataset.d))); el.querySelector('#rg').value = E.clock(v); });
      el.querySelector('[data-ok]').onclick = () => { close(); act(`wex/${x.id}/action`, { action: 'rest', seconds: v }); };
    },
  });
}
export async function pickExercise({ title = 'Pick an exercise', muscle = null, similarTo = null } = {}) {
  const { picker } = await import('./exercises.js');
  return picker({ title, muscle, similarTo });
}
async function replaceFlow(id) {
  const x = W.exercises.find((e) => e.id === id);
  const e = await pickExercise({ title: `Replace ${x.exercise.name}`, muscle: x.muscle, similarTo: x.exercise.id });
  if (!e) return;
  menu(`Swap in ${esc(e.name)}`, [
    { label: 'For the rest of the meso', run: () => act(`wex/${id}/action`, { action: 'replace', exercise_id: e.id, scope: 'meso' }) },
    { label: 'Today only', run: () => act(`wex/${id}/action`, { action: 'replace', exercise_id: e.id, scope: 'today' }) },
  ]);
}
async function addExercise() {
  const e = await pickExercise({ title: 'Add an exercise' });
  if (!e) return;
  try { await api.post(`workouts/${W.id}/exercises`, { exercise_id: e.id, muscle: e.muscle, sets: ctx.settings.startSets }); openId = null; await reload(); } catch (err) { toast(err.message); }
}

// ---------- Test 1RM ----------
async function test1rm(x, s) {
  const info = await api.get(`exercises/${x.exercise.id}/max`);
  const model = x.model;
  let expected = info.expected || E.roundLoad((s.weight ?? s.target_weight ?? 100) * 1.25, model);
  let optional = true;
  const units = ctx.settings.units;
  const step = stepFor(x);
  const body = () => {
    const rows = E.ramp(expected, model, ctx.settings.ramp, { includeOptional: optional }) || [];
    return rows.map((r) => `<div class="row card" style="padding:8px 12px;${r.kind === 'attempt' ? 'border:2px dashed var(--a)' : ''}">
      <div style="width:44px;font-weight:800;color:var(--muted)">${r.pct}%</div>
      <div class="grow"><div style="font-size:17px;font-weight:800">${fmtW(r.weight)} ${units} × ${r.reps}</div><div class="sub">${r.plates ? `${esc(E.platesText(r.plates))} per side` : ''}</div></div>
      <div class="sub" style="text-align:right">rest<br>${r.kind === 'attempt' ? '3–5 min' : E.clock(r.rest)}</div></div>`).join('');
  };
  sheet(`<div class="eyebrow">Test 1RM · ${s && (s.done || s.skipped) ? "adds below this set" : "replaces this set"}</div><div class="h2">${esc(x.exercise.name)}</div>
    <div class="card hot row" style="margin:10px 0;background:linear-gradient(135deg,var(--red-bg),var(--amber-bg))">
      <div class="grow"><div style="font-weight:700;font-size:13px">Expected 1-rep max</div><div class="sub">${info.basis ? `From ${fmtW(info.basis.weight)} × ${info.basis.reps} on ${fmtDate(info.basis.date)}` : 'No history yet. Set your best guess.'}</div></div>
      <button class="icon-btn" data-e="-1" style="border:1px solid var(--amber-line)">−</button><div id="exp" class="num" style="font-size:28px;font-weight:800;min-width:64px;text-align:center">${fmtW(expected)}</div><button class="icon-btn" data-e="1" style="border:1px solid var(--amber-line)">+</button></div>
    <label class="toggle"><span>Include the 92% warm-up</span><span class="switch"><input type="checkbox" id="opt" checked><span></span></span></label>
    <div class="section" style="margin-bottom:6px">Warm-up ramp · ${model.kind === 'plates' ? `${fmtW(model.bar)} ${units} bar · plates per side` : 'rounded to your weight steps'}</div>
    <div id="ramp" style="display:flex;flex-direction:column;gap:6px">${body()}</div>
    <button class="btn primary block" style="margin-top:12px" data-go>Use this ramp</button>`, {
    onMount: (el, close) => {
      const upd = () => { el.querySelector('#exp').textContent = fmtW(expected); el.querySelector('#ramp').innerHTML = body(); };
      $$('[data-e]', el).forEach((b) => b.onclick = () => { expected = E.roundLoad(expected + Number(b.dataset.e) * step, model, Number(b.dataset.e) > 0 ? 'ceil' : 'floor'); upd(); });
      el.querySelector('#opt').onchange = (ev) => { optional = ev.target.checked; upd(); };
      el.querySelector('[data-go]').onclick = async () => { close(); await act(`sets/${s.id}/action`, { action: 'test1rm', expected, includeOptional: optional }); };
    },
  });
}

// ---------- workout menu ----------
function workoutMenu() {
  const m = W.mesoId;
  menu('', [
    { group: 'Meso' },
    { label: 'Meso notes', icon: 'note', run: () => go(`meso/${m}?notes=1`) },
    { label: 'Muscle priorities', icon: 'list', run: () => import('./meso.js').then((mm) => mm.prioritiesSheet(m, reload)) },
    { label: 'Summary', icon: 'chart', run: () => go(`summary/${m}`) },
    { label: 'End meso', icon: 'skip', danger: true, run: async () => { if (await confirmSheet('End this meso?', 'You can still see it in your mesos list and copy it later.', { ok: 'End meso', danger: true })) { await api.post(`mesos/${m}/action`, { action: 'end' }); go(`summary/${m}`); } } },
    { group: 'Workout' },
    { label: 'New note', icon: 'note', run: async () => { const v = await promptSheet('Workout note', { multiline: true }); if (v && v.value) act(`workouts/${W.id}/action`, { action: 'note', text: v.value }); } },
    { label: 'Rename', sub: W.label, icon: 'edit', run: async () => {
      const v = await promptSheet('Workout name', { value: W.label, extra: '<label class="toggle" style="margin-top:8px"><span>Every week of this day</span><span class="switch"><input type="checkbox" data-x="all" checked><span></span></span></label>' });
      if (v && v.value) act(`workouts/${W.id}/action`, { action: 'label', label: v.value, allWeeks: v.all });
    } },
    { label: 'Add exercise', icon: 'plus', run: addExercise },
    { label: 'Bodyweight', sub: W.bodyweight ? `${fmtW(W.bodyweight)} ${ctx.settings.units}` : '', icon: 'scale', run: async () => { const v = await promptSheet(`Bodyweight (${ctx.settings.units})`, { value: W.bodyweight ? fmtW(W.bodyweight) : '' }); if (v && v.value) act(`workouts/${W.id}/action`, { action: 'bodyweight', weight: Number(v.value) }); } },
    { label: expandAll ? 'Collapse exercises' : 'Expand all exercises', icon: 'list', run: () => { expandAll = !expandAll; draw(); } },
    ...(W.status !== 'pending' ? [{ label: 'Reopen workout', icon: 'edit', run: () => act(`workouts/${W.id}/action`, { action: 'reopen' }) }] : []),
    { label: 'Reset workout', sub: 'clear everything logged', icon: 'trash', run: async () => { if (await confirmSheet('Reset this workout?', 'All logged sets and check-ins in it are cleared.', { ok: 'Reset', danger: true })) act(`workouts/${W.id}/action`, { action: 'reset' }); } },
    { label: 'Skip workout', icon: 'skip', danger: true, run: async () => {
      if (!(await confirmSheet('Skip this workout?', 'It counts as skipped and the next one unlocks.', { ok: 'Skip', danger: true }))) return;
      try { await api.post(`workouts/${W.id}/action`, { action: 'skip' }); const h = await loadHome(); go(h.next ? `workout/${h.next.id}` : `summary/${W.mesoId}`); } catch (e) { toast(e.message); }
    } },
  ]);
}
window.addEventListener('jh:synced', () => { if (W && /^workout|^$/.test(location.pathname.split('/').pop() || '')) reload().catch(() => {}); });
