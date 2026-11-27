// Today's workout, in the compact layout: the next exercise opens by itself, any card opens or closes on its own, the set timer on top.
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
// cards you opened or closed yourself; the rest follow the next unfinished exercise
let opened = new Set(); let closed = new Set(); let chimedFor = null;

export async function workout(id, { replaceRoute = false } = {}) {
  const my = seq();
  const data = await api.get(`workouts/${id}`);
  if (my !== seq()) return;
  if (replaceRoute) history.replaceState({}, '', `workout/${id}`);
  if (!W || W.id !== data.id) { opened = new Set(); closed = new Set(); }
  W = data;
  draw();
  startTimer();
}
async function reload() { const d = await api.get(`workouts/${W.id}`); W = d; draw(); }

const workSets = (x) => x.sets;
const isOpenSet = (s) => !s.done && !s.skipped;
const exDone = (x) => x.sets.every((s) => !isOpenSet(s));
function isOpen(x) {
  if (closed.has(x.id)) return false;
  if (opened.has(x.id)) return true;
  const next = W.exercises.find((e) => !exDone(e));
  return !!next && next.id === x.id;
}
const allOpen = () => W.exercises.length > 0 && W.exercises.every(isOpen);
function setAll(open) { opened = new Set(open ? W.exercises.map((x) => x.id) : []); closed = new Set(open ? [] : W.exercises.map((x) => x.id)); }
// a finished exercise folds away so the next one comes up
function doneFold(x) { if (exDone(x)) { opened.delete(x.id); closed.add(x.id); } }

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
  const parts = [header()];
  if (W.status === 'done') parts.push(`<div class="strip green" style="margin:0">Done ${fmtDate(W.finished_at)}${W.firstSetAt && W.lastSetAt ? ` · ${Math.round((W.lastSetAt - W.firstSetAt) / 60000)} min` : ''}</div>`);
  if (W.status === 'skipped') parts.push('<div class="strip" style="margin:0">Skipped. Log a set to bring it back.</div>');
  if (W.status === 'pending' && W.lastSetAt) parts.push('<div class="timer" id="timer"></div>');
  for (const n of W.notes) parts.push(`<div class="pinned">${icon('note', 14)} ${esc(n.text)}</div>`);
  const muscles = W.exercises.map((x) => x.muscle);
  W.exercises.forEach((x, i) => {
    parts.push(exCard(x, isOpen(x), i));
    if (jointOwed(x) && !muscleFinished(x.muscle)) parts.push(`<button class="fb-need" data-fbjoint="${x.id}">${icon('note', 16)} <span>Joint pain needed for ${esc(x.exercise.name)}</span><b>Answer</b></button>`);
    // check-in after the last exercise of a muscle, once all its sets are logged
    const lastOfMuscle = muscles.lastIndexOf(x.muscle) === i;
    if (lastOfMuscle && !W.isDeload && W.status !== 'skipped') {
      const all = W.exercises.filter((e) => e.muscle === x.muscle);
      const finished = all.every(exDone) && all.some((e) => e.sets.some((s) => s.done));
      const has = W.checkins.find((c) => c.muscle === x.muscle);
      if (finished && !has) parts.push(`<button class="fb-need" data-fbneed="${esc(x.muscle)}">${icon('note', 16)} <span>Feedback needed for ${esc(x.muscle.toLowerCase())}</span><b>Answer</b></button>`);
    }
  });
  const allDone = W.exercises.length && W.exercises.every(exDone);
  if (W.status === 'pending') {
    parts.push(`<div class="foot">${allDone ? `<button class="btn primary grow" id="finish">${icon('check')} Finish workout</button>` : `<button class="btn grow" id="expand">${allOpen() ? 'Collapse all' : 'Expand all'}</button><button class="btn grow" id="addex">${icon('plus')} Exercise</button>`}</div>`);
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
  if (needsFinder(x)) strips.push(`<div class="strip amber"><span>${x.suggestion && x.suggestion.stale ? "It's been a while on this one." : 'New exercise for you.'}</span><button class="link-btn" data-find="${x.id}" style="padding:0">Find your weight</button></div>`);
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
    const trTitle = { up: 'Stronger than the same week of your previous meso', flat: 'Same as the same week of your previous meso', down: 'Weaker than the same week of your previous meso' };
    const tr = (s.on_target ? `<span class="trend hit" title="Hit the target">${icon('tgt', 14, 2.5)}</span>` : '')
      + (s.trend ? `<span class="trend ${s.trend}" title="${trTitle[s.trend]}">${icon(s.trend === 'up' ? 'tUp' : s.trend === 'down' ? 'tDown' : 'tFlat', 14, 3)}</span>` : '');
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

// ---------- Feedback sheet ----------
// One full sheet, laid out like the RP app: joint pain per exercise, then the muscle's pump and volume
// (plus soreness first when it's also the muscle's first set). Save unlocks once everything is answered.
const JOINT_OPTS = [['none', 'None'], ['low', 'Low pain'], ['moderate', 'Moderate pain'], ['severe', 'A lot of pain']];
const PUMP_OPTS = [['low', 'Low pump'], ['good', 'Moderate pump'], ['great', 'Amazing pump']];
const VOL_OPTS = [['easy', 'Not enough'], ['right', 'Just right'], ['pushed', 'Pushed my limits'], ['too_much', 'Too much']];
const SORE_OPTS = [['never', 'Never got sore'], ['early', 'Healed a while ago'], ['on_time', 'Healed just in time'], ['sore', 'Still sore']];
const FB_HELP = {
  joint: ['Joint pain', '<p>Any pain in the joints (not the muscle burn) while doing this exercise.</p><p><b>Low pain</b> is noted on the exercise. <b>Moderate</b> or <b>a lot of pain</b> flags it next week with a suggestion to swap it for something that feels better.</p>'],
  pump: ['Pump', '<p>How full and tight the muscle felt during and right after its sets today.</p><p>A low pump with easy work is a sign the muscle can take another set next week.</p>'],
  volume: ['Volume', '<p>How the number of hard sets for this muscle felt today.</p><p><b>Not enough</b> or <b>just right</b> with a low pump adds a set next week. <b>Pushed my limits</b> holds steady (or trims a set without a great pump). <b>Too much</b> takes a set away.</p>'],
  sore: ['Soreness', '<p>How the muscle recovered since you last trained it.</p><p><b>Still sore</b> means it needs more recovery, so sets won\'t be added next week.</p>'],
};
function feedbackSheet(muscle, exercises, { withSoreness = false, jointOnly = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const m = esc(muscle.toLowerCase());
    const tiles = (k, opts, cur) => `<div class="fb-tiles c${opts.length}" data-k="${k}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" class="${cur === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    const head = (title, help) => `<div class="fb-h">${title}<button type="button" class="fb-help" data-help="${help}" aria-label="About ${title}">${icon('info', 20, 2)}</button></div>`;
    const sec = (title, help, q, body) => `<section class="fb-sec">${head(title, help)}<p class="fb-q">${q}</p>${body}</section>`;
    const curSore = withSoreness && W.soreness[muscle] ? W.soreness[muscle].answer : null;
    const html = `<div class="fb">
      <div class="fb-top"><div class="h1">Feedback</div><button type="button" class="fb-x" data-fbx aria-label="Close">${icon('x', 26, 2.2)}</button></div>
      ${withSoreness ? sec(`${esc(muscle)} soreness`, 'sore', `How did your ${m} recover since your last ${m} session?`, tiles('sore', SORE_OPTS, curSore)) : ''}
      ${exercises.map((x) => sec('Joint pain', 'joint', `How did your joints feel during ${esc(x.exercise.name)}?`, tiles(`j${x.id}`, JOINT_OPTS))).join('')}
      ${jointOnly ? '' : sec(`${esc(muscle)} pump`, 'pump', `How much of a pump did you get today in your ${m}?`, tiles('pump', PUMP_OPTS))}
      ${jointOnly ? '' : sec(`${esc(muscle)} volume`, 'volume', `How was the volume of work (number of hard sets) for your ${m}?`, tiles('workload', VOL_OPTS))}
      <div class="fb-foot"><button type="button" class="btn ghost" data-fbcancel>Cancel</button><button type="button" class="btn primary" data-fbsave disabled>${withSoreness ? 'Log set and save' : 'Save'}</button></div></div>`;
    sheet(html, {
      onMount: (el, close) => {
        el.classList.add('fb-sheet');
        const val = (k) => el.querySelector(`[data-k="${k}"] .on`)?.dataset.v;
        const keys = [...(withSoreness ? ['sore'] : []), ...exercises.map((x) => `j${x.id}`), ...(jointOnly ? [] : ['pump', 'workload'])];
        const save = el.querySelector('[data-fbsave]');
        const refresh = () => { save.disabled = !keys.every((k) => val(k)); };
        refresh();
        el.addEventListener('click', (e) => {
          const b = e.target.closest('button'); if (!b) return;
          if (b.dataset.help) { const [t, h] = FB_HELP[b.dataset.help]; infoSheet(t, h); return; }
          if (b.dataset.v && b.parentElement.dataset.k) { b.parentElement.querySelectorAll('button').forEach((q) => q.classList.toggle('on', q === b)); refresh(); return; }
          if (b.dataset.fbx !== undefined || b.dataset.fbcancel !== undefined) { close(); return; }
          if (b.dataset.fbsave !== undefined) {
            if (!keys.every((k) => val(k))) return;
            done = true; close();
            resolve({ soreness: withSoreness ? val('sore') : undefined, pump: val('pump'), workload: val('workload'),
              exJoints: Object.fromEntries(exercises.map((x) => [x.id, val(`j${x.id}`)])) });
          }
        });
      },
      onClose: () => { if (!done) resolve(null); },
    });
  });
}
const checkinBody = (muscle, r) => ({ muscle, pump: r.pump, workload: r.workload, exJoints: r.exJoints });
// Joint pain is asked as each exercise's sets are all done (in the order you finish them). The exercise
// that finishes the muscle gets one sheet with its joint pain plus the muscle's pump and volume.
// Closing a sheet leaves a "needed" button, and no other set logs until it's answered.
const muscleFinished = (muscle) => { const all = W.exercises.filter((e) => e.muscle === muscle); return all.length && all.every(exDone) && all.some((e) => e.sets.some((q) => q.done)); };
// When a muscle's only set today is its first set too, soreness and the feedback come as one sheet.
// Resolves { soreness, pump, workload, exJoints } or null if closed.
const askBoth = (x) => feedbackSheet(x.muscle, jointQs(x.muscle, x), { withSoreness: true });
const fbOn = () => !!W && !W.isDeload && W.status !== 'skipped';
const hasCheckin = (muscle) => !!W.checkins.find((c) => c.muscle === muscle);
// when an exercise's sets were all done: its latest logged set
const doneAt = (x) => Math.max(0, ...x.sets.filter((q) => q.done).map((q) => q.logged_at || 0));
// an exercise whose sets are all done still owes its joint pain answer
const jointOwed = (x) => fbOn() && exDone(x) && x.sets.some((q) => q.done) && x.joint_answer == null && !hasCheckin(x.muscle);
// a muscle's unanswered joint questions, in the order those exercises were finished (extra: the one being logged now, last)
const jointQs = (muscle, extra = null) => W.exercises.filter((e) => e.muscle === muscle && e !== extra && jointOwed(e))
  .sort((a, b) => doneAt(a) - doneAt(b)).concat(extra && extra.joint_answer == null ? [extra] : []);
// the feedback owed first (finished first): { muscle } for a finished muscle's sheet, { x } for one exercise's joint pain
function owedFeedback() {
  if (!fbOn() || W.status !== 'pending') return null;
  const items = [];
  for (const m of new Set(W.exercises.map((e) => e.muscle))) {
    const mx = W.exercises.filter((e) => e.muscle === m);
    if (muscleFinished(m)) { if (!hasCheckin(m)) items.push({ muscle: m, at: Math.max(...mx.map(doneAt)) }); } else for (const x of mx.filter(jointOwed)) items.push({ x, at: doneAt(x) });
  }
  items.sort((a, b) => a.at - b.at);
  return items[0] || null;
}
// resolves true once answered
const askOwed = (o) => (o.muscle ? openFeedback(o.muscle) : openJoint(o.x));
// right after a set is logged: ask what that exercise (or its muscle) now owes
function maybeAskFeedback(x) {
  if (!x || !fbOn() || !exDone(x)) return;
  if (muscleFinished(x.muscle)) { if (!hasCheckin(x.muscle)) openFeedback(x.muscle); } else if (jointOwed(x)) openJoint(x);
}
// would logging this set finish every set of its muscle today?
const finishesMuscle = (x, s) => W.exercises.filter((e) => e.muscle === x.muscle).every((e) => e.sets.every((q) => q === s || !isOpenSet(q)));
async function openFeedback(muscle) {
  const r = await feedbackSheet(muscle, jointQs(muscle));
  if (!r) { draw(); return false; }
  try {
    const res = await api.queued('POST', `workouts/${W.id}/checkin`, checkinBody(muscle, r));
    if (res && res.queued) { W.checkins.push({ muscle }); keepJoints(r.exJoints); draw(); return true; }
    toast('Feedback saved'); window.__jhKeepScroll = true; await reload(); return true;
  } catch (err) { toast(err.message); return false; }
}
async function openJoint(x) {
  const r = await feedbackSheet(x.muscle, [x], { jointOnly: true });
  if (!r) { draw(); return false; }
  try {
    const res = await api.queued('POST', `wex/${x.id}/action`, { action: 'jointAnswer', value: r.exJoints[x.id] });
    if (res && res.queued) { keepJoints(r.exJoints); draw(); return true; }
    window.__jhKeepScroll = true; await reload(); return true;
  } catch (err) { toast(err.message); return false; }
}
// offline: remember the answers here until the phone syncs
function keepJoints(exJoints) { for (const [id, v] of Object.entries(exJoints || {})) { const e = W.exercises.find((q) => q.id === Number(id)); if (e) e.joint_answer = v; } }

// Asked as a pop-up when you log the first set for a muscle in this workout. Tapping away logs that
// set, then a red "feedback is required" badge blocks the muscle's other sets until you answer.
function askSoreness(muscle, checkinId) {
  return new Promise((resolve) => {
    let picked = false;
    sheet(`<div class="eyebrow">${esc(muscle)}</div><div class="h2">How's your ${esc(muscle.toLowerCase())} from last time?</div>
      <p class="sub" style="margin:4px 0 12px">Soreness since your last ${esc(muscle.toLowerCase())} session. It helps set next week's sets.</p>
      <div class="menu">${[['never', 'Never got sore'], ['early', 'Healed a while ago'], ['on_time', 'Healed just in time'], ['sore', 'Still sore']].map(([v, l]) => `<button data-sv="${v}"><span>${l}</span>${W.soreness[muscle] && W.soreness[muscle].answer === v ? '<small>current</small>' : ''}</button>`).join('')}</div>`, {
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
  if (!sore) return null;
  // the muscle's first logged set always asks (even again after un-logging it); later sets only if it's unanswered
  return !muscleStarted(x.muscle) || !sore.answer ? sore : null;
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
// A number typed in a set row is still saving when Log is tapped (tapping Log is what closes the box),
// so Log waits for that save and then logs with it. Extra taps on a set that is already logging are ignored.
let inlineOpen = null; // finish() of the box open in a set row, if any
let inlineSaving = null; // promise of a row save in flight: true when it worked
const logging = new Set();
async function logSet(id, values) {
  if (logging.has(id)) return;
  logging.add(id);
  try {
    if (inlineOpen) inlineOpen(true); // phones may not close the box when a button is tapped
    if (inlineSaving) { savingLook(id, true); if (!(await inlineSaving)) return; } // the save failed and said why; nothing is logged
    return await logSetNow(id, values);
  } finally { logging.delete(id); savingLook(id, false); }
}
// while a set saves, a light runs around its Log button (the page redraws it as logged when done)
function savingLook(id, on) {
  const b = document.querySelector(`.log[data-log="${id}"]`);
  if (b) { b.classList.toggle('saving', on); b.setAttribute('aria-busy', on ? 'true' : 'false'); }
}
async function logSetNow(id, values) {
  const { x, s } = findSet(id);
  if (!s) return;
  const weight = values.weight !== undefined ? values.weight : (s.weight ?? s.target_weight);
  const reps = values.reps !== undefined ? values.reps : (s.reps ?? s.target_reps);
  if (reps == null) return editSet(id);
  if (x.model.kind !== 'none' && weight == null) return editSet(id);
  // feedback owed for an exercise or muscle you finished blocks logging until it's answered
  const fb = !s.done && owedFeedback();
  if (fb) {
    if (!(await askOwed(fb))) { toast('Answer the feedback first'); return; }
    return logSetNow(id, values); // the answer reloaded the workout
  }
  // an owed "feedback is required" answer (any muscle) blocks logging any other set until it's given
  const owed = Object.keys(W.soreness || {}).find((m) => feedbackDue(m));
  if (owed && !s.done) {
    const answered = await askSoreness(owed, W.soreness[owed].checkinId);
    if (!answered) { toast(`Answer the ${owed.toLowerCase()} question first`); draw(); return; }
  }
  const sore = needsSoreness(x);
  let feel = null; let askedBoth = false;
  if (sore && !s.done && !muscleStarted(x.muscle) && finishesMuscle(x, s) && !W.isDeload && !W.checkins.find((c) => c.muscle === x.muscle)) {
    askedBoth = true;
    const r = await askBoth(x);
    if (r) {
      try { await api.queued('POST', `checkins/${sore.checkinId}/soreness`, { value: r.soreness }); W.soreness[x.muscle].answer = r.soreness; } catch (err) { toast(err.message); }
      feel = r;
    } // tapping away still logs the set; the questions stay on the card and badge
  } else if (sore) {
    const answered = await askSoreness(x.muscle, sore.checkinId);
    // tapping away still logs the muscle's first set; after that the answer is required
    if (!answered && muscleStarted(x.muscle)) { draw(); return; }
  }
  const at = Date.now();
  savingLook(id, true);
  const res = await api.queued('PUT', `sets/${id}`, { weight: x.model.kind === 'none' ? null : weight, reps, done: true, at });
  if (res.queued) {
    // apply here so the phone keeps working without signal
    Object.assign(s, { weight, reps, done: 1, skipped: 0, logged_at: at });
    W.lastSetAt = at; W.firstSetAt = W.firstSetAt || at; W.lastSet = { logged_at: at, rest: s.rest, wex_id: x.id };
    doneFold(x);
    if (feel) { try { await api.queued('POST', `workouts/${W.id}/checkin`, checkinBody(x.muscle, feel)); } catch (err) { toast(err.message); } }
    draw(); if (!feel && !askedBoth) maybeAskFeedback(x); return;
  }
  afterLog(res);
  doneFold(x);
  if (feel) { try { await api.post(`workouts/${W.id}/checkin`, checkinBody(x.muscle, feel)); toast('Feedback saved'); } catch (err) { toast(err.message); } }
  window.__jhKeepScroll = true;
  await reload();
  if (!feel && !askedBoth) maybeAskFeedback(W.exercises.find((e) => e.id === x.id)); // closed unanswered: the needed button stays
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
      const vals = (logging) => {
        if (field === 'w') return { weight: wVal() }; // reps stay as they were (an unlogged target follows the weight)
        if (field === 'r') return { reps: rVal() };
        // an unlogged set keeps no reps until you choose them, so the target keeps following the weight
        return !logging && !s.done && !repsTouched ? { weight: wVal() } : { weight: wVal(), reps: rVal() };
      };
      el.querySelector('[data-save]').onclick = async () => {
        const v = vals();
        if (field === 'r' && s.done && (v.reps == null || (v.reps < 1 && s.kind !== 'attempt'))) { toast('Enter the reps'); return; }
        close(); try { await api.queued('PUT', `sets/${id}`, v); await reload(); } catch (e) { toast(e.message); }
      };
      const lg = el.querySelector('[data-logit]');
      if (lg) lg.onclick = async () => {
        const v = vals(true);
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
  const finish = (save) => {
    if (finished) return; finished = true;
    if (inlineOpen === finish) inlineOpen = null;
    const p = save$(save);
    inlineSaving = p;
    p.finally(() => { if (inlineSaving === p) inlineSaving = null; });
    return p;
  };
  inlineOpen = finish;
  // resolves true when there was nothing to save or it saved (or was queued offline), false when it didn't
  const save$ = async (save) => {
    const raw = inp.value.trim().replace(',', '.');
    window.__jhKeepScroll = true;
    // clearing your own reps on an unlogged set brings the recommended target back
    if (save && raw === '' && field === 'r' && !s.done && s.reps != null) {
      try { const res = await api.queued('PUT', `sets/${id}`, { reps: null }); if (res && res.queued) { s.reps = null; draw(); return true; } window.__jhKeepScroll = true; await reload(); return true; } catch (e) { toast(e.message); draw(); return false; }
    }
    if (!save || raw === '' || raw === (cur == null ? '' : field === 'w' ? fmtW(cur) : String(cur))) { draw(); return true; }
    const v = Number(raw);
    if (!isFinite(v) || v < 0) { toast(field === 'w' ? 'Check the weight' : 'Check the reps'); draw(); return false; }
    const body = field === 'w' ? { weight: v } : { reps: Math.round(v) };
    if (field === 'r' && s.done && body.reps < 1 && s.kind !== 'attempt') { toast('Enter the reps'); draw(); return false; }
    try {
      const res = await api.queued('PUT', `sets/${id}`, body);
      if (res && res.queued) { Object.assign(s, body); draw(); return true; }
      window.__jhKeepScroll = true;
      await reload();
      return true;
    } catch (e) { toast(e.message); draw(); return false; }
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
      if (d.toggle) { const x = W.exercises.find((e) => e.id === Number(d.toggle)); if (x) { if (isOpen(x)) { opened.delete(x.id); closed.add(x.id); } else { closed.delete(x.id); opened.add(x.id); } } draw(); return; }
      if (d.askfb) { const so = W.soreness[d.askfb]; if (so && (await askSoreness(d.askfb, so.checkinId))) draw(); return; }
      if (d.find) return findWeight(Number(d.find));
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
      if (t.id === 'expand') { setAll(!allOpen()); draw(); return; }
      if (t.id === 'addex') return addExercise();
      if (d.v && t.parentElement.dataset.k) { $$('button', t.parentElement).forEach((q) => q.classList.toggle('on', q === t)); return; }
      if (d.v && t.parentElement.dataset.sore) { await api.post(`checkins/${t.parentElement.dataset.sore}/soreness`, { value: d.v }); toast('Thanks. That steers next week\'s sets.'); await reload(); return; }
      if (d.fbneed) return openFeedback(d.fbneed);
      if (d.fbjoint) { const fx = W.exercises.find((e) => e.id === Number(d.fbjoint)); if (fx) await openJoint(fx); return; }
    } catch (err) { toast(err.message); }
  };
}

async function finish() {
  const fb = owedFeedback();
  if (fb && !(await askOwed(fb))) { toast('Answer the feedback first'); return; }
  if (owedFeedback()) return finish();
  try {
    await api.post(`workouts/${W.id}/action`, { action: 'finish' });
  } catch (e) {
    if (e.status === 409 && /not logged/.test(e.message)) {
      if (!(await confirmSheet('Finish anyway?', `${e.message}. They'll be marked as skipped.`, { ok: 'Finish' }))) return;
      await api.post(`workouts/${W.id}/action`, { action: 'finish', force: true });
    } else { toast(e.message); return; }
  }
  try { await reload(); } catch {}
  const h = await loadHome();
  recap(h);
}

// A short recap after finishing: what got done, time, volume, and how sets compared with last time at this RIR.
function recap(h) {
  const units = ctx.settings.units;
  const work = (x) => x.sets.filter((q) => q.kind !== 'warmup');
  const doneEx = W.exercises.filter((x) => work(x).some((q) => q.done)).length;
  const skippedEx = W.exercises.length - doneEx;
  const sets = W.exercises.reduce((n, x) => n + work(x).filter((q) => q.done).length, 0);
  const vol = W.exercises.reduce((v, x) => v + work(x).filter((q) => q.done && q.weight > 0 && q.reps > 0).reduce((a, q) => a + q.weight * q.reps, 0), 0);
  const mins = W.firstSetAt && W.lastSetAt ? Math.max(1, Math.round((W.lastSetAt - W.firstSetAt) / 60000)) : null;
  const tr = { up: 0, flat: 0, down: 0 };
  for (const x of W.exercises) for (const q of x.sets) if (q.trend) tr[q.trend]++;
  const anyTrend = tr.up + tr.flat + tr.down > 0;
  let tgtN = 0; let tgtHit = 0;
  for (const x of W.exercises) for (const q of x.sets) if (q.on_target != null) { tgtN++; if (q.on_target) tgtHit++; }
  const stat = (n, l) => `<div class="recap-stat"><div class="n">${n}</div><div class="l">${l}</div></div>`;
  const nextLabel = h.next ? `Next workout · Week ${h.next.week} Day ${h.next.day}` : 'Meso summary';
  sheet(`<div class="recap">
      <div class="recap-ring">${icon('check', 34, 3)}</div>
      <div class="eyebrow" style="text-align:center">Week ${W.week} · Day ${W.dayPos + 1} done</div>
      <div class="h2" style="text-align:center">Workout complete</div>
      <p class="sub" style="text-align:center;margin:4px 0 14px">Growth happens while you recover. Eat well and sleep well before the next one.</p>
      <div class="recap-grid">
        ${stat(doneEx, 'exercises done')}${stat(skippedEx, 'skipped')}
        ${stat(sets, 'sets logged')}${stat(mins ? `${mins}<small> min</small>` : '—', 'time')}
        ${stat(vol ? `${Math.round(vol).toLocaleString()}<small> ${units}</small>` : '—', 'volume (weight × reps)')}
        ${stat(anyTrend ? `<span class="t-up">${tr.up}↑</span> <span class="t-flat">${tr.flat}→</span> <span class="t-down">${tr.down}↓</span>` : '—', 'sets vs same week, last meso')}
        ${stat(tgtN ? `${tgtHit}<small> of ${tgtN}</small>` : '—', 'sets on target')}
      </div>
      <button class="btn primary block" style="margin-top:16px" data-recapnext>${nextLabel}</button>
      <button class="btn block" style="margin-top:8px" data-recapstay>Stay on this workout</button></div>`, {
    onMount: (el, close) => {
      el.querySelector('[data-recapnext]').onclick = () => { close(); if (h.next) go(`workout/${h.next.id}`); else go(`summary/${W.mesoId}`); };
      el.querySelector('[data-recapstay]').onclick = close;
    },
  });
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
    ...(x.model.kind !== 'none' && W.status === 'pending' ? [{ label: 'Find your weight', sub: 'a few quick sets to set your target', icon: 'bolt', info: FINDER_INFO, run: () => findWeight(id) }] : []),
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
  try { await api.post(`workouts/${W.id}/exercises`, { exercise_id: e.id, muscle: e.muscle, sets: ctx.settings.startSets }); await reload(); } catch (err) { toast(err.message); }
}

// ---------- find your weight ----------
// For an exercise you've never done (or not for 6+ weeks): a few rising sets at the target reps.
// After each one you say how many more reps you had in the tank; the estimated max from that sets the
// next weight, until a set lands within 1 rep of this week's RIR. That weight becomes the target.
const FINDER_INFO = { title: 'Find your weight', html: `<p>A short ramp to find the right weight for an exercise you haven't done, or haven't done in a while.</p>
  <ol><li>Start light: a weight you're sure you can lift for the target reps.</li>
  <li>Do the target reps, then say how many more you could have done.</li>
  <li>The app picks the next weight from that. Rest a minute or two and repeat.</li>
  <li>Once a set lands close to this week's RIR, that weight becomes your target for the working sets.</li></ol>
  <p class="sub">These count as warm-ups, not working sets. Usually 2 to 4 steps.</p>` };
function needsFinder(x) {
  if (W.status !== 'pending' || W.isDeload || x.model.kind === 'none') return false;
  const work = x.sets.filter((q) => q.kind !== 'warmup' && q.kind !== 'attempt');
  if (!work.length || x.sets.some((q) => q.done)) return false;
  const neverDone = work.every((q) => !q.last);
  return neverDone || !!(x.suggestion && x.suggestion.stale);
}
async function findWeight(id) {
  const x = W.exercises.find((e) => e.id === id); if (!x) return;
  const units = ctx.settings.units;
  const work = x.sets.find((q) => q.kind !== 'warmup' && q.kind !== 'attempt' && !q.done && !q.skipped);
  if (!work) { toast('No working sets left to set'); return; }
  const R = work.plan_reps || work.target_reps || 10;
  const rir = Math.min(W.rir ?? 2, 4);
  let w = work.target_weight ?? (x.suggestion && x.suggestion.weight) ?? null; // no guess: you pick the first weight
  if (w != null) w = E.roundLoad(w * 0.8, x.model, 'floor'); // start a bit under the guess
  for (let step = 1; step <= 5; step++) {
    const r = await finderStep(x, step, w, R, rir, units);
    if (!r) { toast('Stopped. Your warm-ups are saved.'); await reload(); return; }
    try { await api.post(`wex/${id}/action`, { action: 'feeler', weight: r.weight, reps: r.reps }); } catch (e) { toast(e.message); return; }
    const load = E.effectiveLoad(r.weight, x.model, x.bodyweight) ?? r.weight;
    const left = Math.min(r.left, 6);
    let max = E.e1rm(load, r.reps, left);
    const next = max ? E.fitWeight(max, R, rir, x.model, x.bodyweight) : null;
    const close = r.reps >= R - 1 && Math.abs(left - rir) <= 1;
    if (close || step === 5 || next == null) {
      const final = close ? r.weight : next ?? r.weight;
      try { await api.post(`wex/${id}/action`, { action: 'setTarget', weight: final, reps: R }); } catch (e) { toast(e.message); return; }
      await reload();
      return infoSheet('Your working weight', `<p><b>${fmtW(final)} ${units} × ${R}</b> at ${esc(rirText(W.rir))} is now the target for your working sets.</p><p class="sub">Rest a couple of minutes, then start your first working set.</p>`);
    }
    // 5+ or 10+ left only says "a lot", so jump by a set share instead of trusting the estimate
    w = r.left >= 10 ? E.roundLoad(r.weight * 1.6, x.model, 'floor') : r.left >= 5 ? Math.max(next, E.roundLoad(r.weight * 1.3, x.model, 'floor')) : next;
    if (w <= r.weight && left > rir) w = E.roundLoad(r.weight * 1.05, x.model, 'ceil'); // had more in the tank: go up at least a step
    if (w >= r.weight && left < rir) w = E.roundLoad(r.weight * 0.92, x.model, 'floor'); // too hard: come down
    await reload();
  }
}
function finderStep(x, step, w, R, rir, units) {
  return new Promise((resolve) => {
    let picked = false;
    sheet(`<div class="eyebrow">Find your weight · step ${step}</div><div class="h2">${esc(x.exercise.name)}</div>
      <p class="sub" style="margin:4px 0 10px">Do <b>${R} reps</b>${step === 1 ? ' with a weight you know is easy' : ''}, then pick how many more you could have done. Aim: ${esc(rirText(W.rir))}.</p>
      <div class="row" style="gap:8px;margin-bottom:10px"><label class="grow"><div class="q">Weight (${units})</div><input class="input" id="fw" inputmode="decimal" value="${w == null ? '' : fmtW(w)}"></label>
      <label style="width:90px"><div class="q">Reps</div><input class="input" id="fr" inputmode="numeric" value="${R}"></label></div>
      <div class="q">Reps left in the tank</div>
      <div class="seg" data-k="left" style="flex-wrap:wrap">${[0, 1, 2, 3, 4, 5, 10].map((n) => `<button type="button" data-left="${n}">${n === 5 ? '5 to 9' : n === 10 ? '10+' : n}</button>`).join('')}</div>
      <button class="btn block" style="margin-top:12px" data-finfo>How this works</button>`, {
      onMount: (el, close) => el.addEventListener('click', (e) => {
        if (e.target.closest('[data-finfo]')) { infoSheet(FINDER_INFO.title, FINDER_INFO.html); return; }
        const b = e.target.closest('[data-left]'); if (!b) return;
        const weight = Number(String(el.querySelector('#fw').value).replace(',', '.'));
        const reps = Math.round(Number(el.querySelector('#fr').value));
        if (!(weight >= 0) || el.querySelector('#fw').value === '') { toast('Enter the weight'); return; }
        if (!(reps > 0)) { toast('Enter the reps'); return; }
        picked = true; close(); resolve({ weight, reps, left: Number(b.dataset.left) });
      }),
      onClose: () => { if (!picked) resolve(null); },
    });
  });
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
    { label: allOpen() ? 'Collapse all exercises' : 'Expand all exercises', icon: 'list', run: () => { setAll(!allOpen()); draw(); } },
    ...(W.status !== 'pending' ? [{ label: 'Reopen workout', icon: 'edit', run: () => act(`workouts/${W.id}/action`, { action: 'reopen' }) }] : []),
    { label: 'Reset workout', sub: 'clear everything logged', icon: 'trash', run: async () => { if (await confirmSheet('Reset this workout?', 'All logged sets and check-ins in it are cleared.', { ok: 'Reset', danger: true })) act(`workouts/${W.id}/action`, { action: 'reset' }); } },
    { label: 'Skip workout', icon: 'skip', danger: true, run: async () => {
      if (!(await confirmSheet('Skip this workout?', 'It counts as skipped and the next one unlocks.', { ok: 'Skip', danger: true }))) return;
      try { await api.post(`workouts/${W.id}/action`, { action: 'skip' }); const h = await loadHome(); go(h.next ? `workout/${h.next.id}` : `summary/${W.mesoId}`); } catch (e) { toast(e.message); }
    } },
  ]);
}
window.addEventListener('jh:synced', () => { if (W && /^workout|^$/.test(location.pathname.split('/').pop() || '')) reload().catch(() => {}); });
