// New meso: copy a past one (the main way), start from a template, or build from scratch.
// All three end in the same builder: days, muscle slots, exercises, sets, then create.
import { api, E, esc, icon, toast, sheet, menu, confirmSheet, mColor, PRIORITY, WEEKDAY, fmtW, fmtDate, rirText, $, $$ } from './ui.js';
import { ctx, go, loadHome, exercises } from './app.js';

const app = () => document.getElementById('app');
const DRAFT = 'jh-draft';
let B = null; // the board being built
const save = () => { try { localStorage.setItem(DRAFT, JSON.stringify(B)); } catch { /* ignore */ } };
const load = () => { try { return JSON.parse(localStorage.getItem(DRAFT) || 'null'); } catch { return null; } };
const clear = () => { try { localStorage.removeItem(DRAFT); } catch { /* ignore */ } };
const blank = () => ({ name: '', weeks: 4, deload: true, priorities: {}, source: null, days: [{ label: 'Day 1', weekday: 1, slots: [] }] });

export async function start() {
  const list = await api.get('mesos');
  const draft = load();
  const last = list[0];
  app().innerHTML = `<div class="h1" style="margin-top:4px">New meso</div>
    ${draft && draft.days && draft.days.some((d) => d.slots.length) ? `<button class="tile" id="resume"><div class="ic">${icon('edit', 22)}</div><div class="grow"><div style="font-weight:800">Continue your draft</div><div class="sub">${esc(draft.name || 'Untitled')} · ${draft.days.length} days</div></div>${icon('right')}</button>` : ''}
    ${last ? `<button class="tile primary" id="copy"><div class="ic">${icon('copy', 22)}</div><div class="grow"><div style="font-weight:800;font-size:17px">Copy last meso</div><div class="sub">${esc(last.name)} · ${last.days} days a week. Same days and exercises, weights carried over.</div></div>${icon('right')}</button>` : ''}
    <button class="tile" id="tpl"><div class="ic">${icon('grid', 22)}</div><div class="grow"><div style="font-weight:800">From a template</div><div class="sub">115 built-in programs plus the ones you save</div></div>${icon('right')}</button>
    <button class="tile" id="build"><div class="ic">${icon('plus', 22)}</div><div class="grow"><div style="font-weight:800">Build your own</div><div class="sub">Pick days, muscles and exercises</div></div>${icon('right')}</button>
    ${list.length > 1 ? `<div class="section">Or copy another meso</div><div class="card" style="padding:0 12px">${list.slice(1, 8).map((m) => `<a class="list-item" href="new/copy/${m.id}" data-link style="color:inherit"><div class="grow"><div style="font-weight:700">${esc(m.name)}</div><div class="sub">${m.weeks} weeks · ${m.days} days · ${fmtDate(m.created_at)}</div></div>${icon('right', 16)}</a>`).join('')}</div>` : ''}`;
  const r = $('#resume'); if (r) r.onclick = () => { B = draft; go('new/build'); };
  const c = $('#copy'); if (c) c.onclick = () => go(`new/copy/${last.id}`);
  $('#tpl').onclick = () => go('new/template');
  $('#build').onclick = () => { B = blank(); save(); go('new/build'); };
}

// ---------- copy ----------
export async function copy(id) {
  if (!id) { const list = await api.get('mesos'); if (!list.length) return go('new/build'); id = list[0].id; }
  let week = null; let day = 0; let p = await api.get(`mesos/${id}/copy`);
  week = p.week;
  const u = p.units;
  const draw = () => {
    const d = p.days[day];
    app().innerHTML = `<div class="row" style="gap:6px"><i style="flex:1;height:5px;border-radius:3px;background:var(--b)"></i><i style="flex:1;height:5px;border-radius:3px;background:var(--b)"></i><i style="flex:1;height:5px;border-radius:3px;background:var(--line2)"></i></div>
      <div><div class="eyebrow">New meso · step 2 of 3</div><div class="h1">Copy “${esc(p.name)}”</div><div class="sub">${p.days.length} days a week · ${p.weeks} weeks${p.deload ? ' incl. deload' : ''}</div></div>
      <div class="section">Start from which week?</div>
      <div class="row" style="gap:6px">${Array.from({ length: p.weeks }, (_, i) => i + 1).map((w) => `<button class="btn grow" data-week="${w}" style="height:54px;flex-direction:column;gap:0;padding:0;${w === week ? 'background:var(--grad);color:var(--on-grad);border:0' : ''}"><span style="font-weight:800">${p.deload && w === p.weeks ? 'DL' : `Wk ${w}`}</span><span style="font-size:11px">${p.deload && w === p.weeks ? 'deload' : rirText(p.rirs[w - 1])}${w === p.suggestedWeek ? ' ★' : ''}</span></button>`).join('')}</div>
      <p class="sub" style="margin:0">Weights carry over from week ${week}${week === p.suggestedWeek ? ' (your last hard week)' : ''}. Sets go back to the starting amount, and reps step down a little for the easier first week.</p>
      <div class="chips">${p.days.map((x, i) => `<button class="chip ${i === day ? 'on' : ''}" data-day="${i}">${esc(x.label)}</button>`).join('')}</div>
      <div class="section">Suggested week 1 weights · ${esc(d.label)}</div>
      ${d.slots.map((s) => `<div class="card ${s.start && s.start.label !== 'Carried over' ? 'hot' : ''}" style="padding:10px 12px">
        <div class="row" style="justify-content:space-between"><span class="tag" style="color:${mColor(s.muscle)}">${esc(s.muscle)}</span>${s.start ? `<span class="pill ${s.start.label === 'Rough guess' || s.start.label === 'Hint only' ? 'amber' : 'green'}" style="font-size:10px">${esc(s.start.label.toUpperCase())}</span>` : '<span class="pill gray" style="font-size:10px">NEW</span>'}</div>
        <div class="row" style="align-items:flex-end;margin-top:2px"><div class="grow" style="font-weight:700;font-size:15px">${esc(s.exercise)}</div><div style="font-size:19px;font-weight:800;white-space:nowrap">${s.start && s.start.reps ? `${s.start.weight != null ? `${fmtW(s.start.weight)} × ` : ''}${s.start.reps}` : '—'}</div></div>
        <div class="sub">${s.start ? esc(s.start.text) : 'No history. Pick a weight that leaves 2 reps in the tank.'} · ${s.sets} sets</div>
        ${s.pinned.length ? `<div class="pinned">${esc(s.pinned.join(' · '))}</div>` : ''}</div>`).join('')}
      <div class="row" style="margin-top:4px"><a class="btn grow" href="new" data-link>Back</a><button class="btn primary" style="flex:2" id="next">Next: review days</button></div>`;
  };
  draw();
  app().onclick = async (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.week) { week = Number(t.dataset.week); p = await api.get(`mesos/${id}/copy?week=${week}`); draw(); }
    if (t.dataset.day) { day = Number(t.dataset.day); draw(); }
    if (t.id === 'next') {
      const nextName = p.name.replace(/(\d{1,2})-(\d{4})/, () => { const d = new Date(); return `${d.getMonth() + 1}-${d.getFullYear()}`; });
      B = { name: nextName === p.name ? `${p.name} (next)` : nextName, weeks: p.weeks, deload: p.deload, priorities: p.priorities, source: { copiedFrom: p.id, week },
        days: p.days.map((d) => ({ label: d.label, weekday: d.weekday, slots: d.slots.map((s) => ({ muscle: s.muscle, exercise_id: s.exercise_id, exercise: s.exercise, equipment: s.equipment, sets: s.sets, start: s.start && s.start.reps ? s.start : null })) })) };
      save(); go('new/build');
    }
  };
}

// ---------- templates ----------
const TF = { focus: '', days: 0, gender: '' };
export async function templates() {
  const list = await api.get('templates');
  const focuses = Array.from(new Set(list.map((t) => t.focus)));
  const draw = () => {
    const shown = list.filter((t) => (!TF.focus || t.focus === TF.focus) && (!TF.days || t.daysPerWeek === TF.days) && (!TF.gender || !t.gender || t.gender === TF.gender));
    app().innerHTML = `<button class="link-btn" id="back">${icon('back', 16)} New meso</button><div class="h1">Templates</div>
      <div class="chips"><button class="chip ${!TF.focus ? 'on' : ''}" data-f="">All</button>${focuses.map((f) => `<button class="chip ${TF.focus === f ? 'on' : ''}" data-f="${esc(f)}">${esc(f)}</button>`).join('')}</div>
      <div class="chips"><button class="chip ${!TF.days ? 'on' : ''}" data-d="0">Any days</button>${[2, 3, 4, 5, 6].map((d) => `<button class="chip ${TF.days === d ? 'on' : ''}" data-d="${d}">${d} days</button>`).join('')}
        <button class="chip ${TF.gender === 'male' ? 'on' : ''}" data-g="male">Men's</button><button class="chip ${TF.gender === 'female' ? 'on' : ''}" data-g="female">Women's</button></div>
      <div class="card" style="padding:0 12px">${shown.map((t) => `<div class="list-item"><button data-t="${t.id}" class="grow" style="background:none;border:0;text-align:left;padding:0"><div style="font-weight:700">${esc(t.name)}</div>
        <div class="sub">${esc(t.focus)} · ${t.daysPerWeek} days${t.exercisesPrefilled ? ' · exercises included' : ' · you pick exercises'}</div></button>${!t.builtin ? `<button class="icon-btn" data-del="${t.id}" aria-label="Delete template">${icon('trash', 16)}</button>` : icon('right', 16)}</div>`).join('') || '<div class="empty">No templates match.</div>'}</div>`;
  };
  draw();
  app().onclick = async (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.id === 'back') return go('new');
    if (t.dataset.f !== undefined) { TF.focus = t.dataset.f; return draw(); }
    if (t.dataset.d !== undefined) { TF.days = Number(t.dataset.d); return draw(); }
    if (t.dataset.g) { TF.gender = TF.gender === t.dataset.g ? '' : t.dataset.g; return draw(); }
    if (t.dataset.del) { if (await confirmSheet('Delete this template?', 'Your mesos are not affected.', { ok: 'Delete', danger: true })) { await api.del(`templates/${t.dataset.del}`); return templates(); } return; }
    if (t.dataset.t) {
      const d = await api.get(`templates/${t.dataset.t}`);
      B = { name: d.name, weeks: 4, deload: true, priorities: d.priorities || {}, source: { template: d.id }, days: d.days.map((x) => ({ label: x.label, weekday: x.weekday, slots: x.slots.map((s) => ({ ...s, sets: s.sets || ctx.settings.startSets })) })) };
      save(); go('new/build');
    }
  };
}

// ---------- builder ----------
const sugCache = new Map();
async function suggestion(exId, rir) {
  const k = `${exId}:${rir}`;
  if (!sugCache.has(k)) sugCache.set(k, api.get(`exercises/${exId}/suggest?rir=${rir}`).catch(() => null));
  return sugCache.get(k);
}
export async function build() {
  if (!B) B = load() || blank();
  const all = await exercises();
  const byId = new Map(all.map((e) => [e.id, e]));
  const rir1 = E.rirSchedule(B.weeks, B.deload)[0];
  const draw = () => {
    save();
    const muscles = Array.from(new Set(B.days.flatMap((d) => d.slots.map((s) => s.muscle))));
    app().innerHTML = `<div class="row" style="gap:6px"><i style="flex:1;height:5px;border-radius:3px;background:var(--b)"></i><i style="flex:1;height:5px;border-radius:3px;background:var(--b)"></i><i style="flex:1;height:5px;border-radius:3px;background:var(--b)"></i></div>
      <div class="row"><div class="grow"><div class="eyebrow">New meso · ${B.source && B.source.copiedFrom ? 'review the copy' : 'build it'}</div><div class="h1">Days and exercises</div></div><button class="icon-btn" id="board" aria-label="Board menu">${icon('more', 20)}</button></div>
      ${B.days.map((d, di) => `<div class="card" data-day="${di}" style="padding:10px 12px">
        <div class="row"><input class="input" data-dlabel="${di}" value="${esc(d.label)}" style="height:38px;font-weight:800;flex:1" aria-label="Day name">
          <select class="input" data-dwd="${di}" style="height:38px;width:86px" aria-label="Weekday"><option value="">—</option>${WEEKDAY.map((w, i) => `<option value="${i}" ${d.weekday === i ? 'selected' : ''}>${w}</option>`).join('')}</select>
          <button class="icon-btn" data-dmenu="${di}" aria-label="Day menu">${icon('more', 18)}</button></div>
        ${d.slots.map((s, si) => { const e = s.exercise_id ? byId.get(s.exercise_id) : null; return `<div class="row" style="padding:6px 0;border-top:1px solid var(--line);margin-top:6px">
          <div class="stripe" style="background:${mColor(s.muscle)};height:34px"></div>
          <button class="grow" data-pick="${di}:${si}" style="background:none;border:0;text-align:left;padding:0;min-width:0"><div class="tag" style="color:${mColor(s.muscle)}">${esc(s.muscle)} · ${PRIORITY[B.priorities[s.muscle] || 'grow']}</div>
            <div style="font-weight:700" class="ell">${e ? esc(e.name) : '<span style="color:var(--amber)">Pick an exercise</span>'}</div>
            <div class="sub" data-sug="${di}:${si}">${s.start && s.start.reps ? `Start ${s.start.weight != null ? `${fmtW(s.start.weight)} × ` : ''}${s.start.reps} · ${esc(s.start.label)}` : ''}</div></button>
          <div class="row" style="gap:2px"><button class="icon-btn" data-sets="${di}:${si}:-1" aria-label="Fewer sets">−</button><div style="width:30px;text-align:center;font-weight:800">${s.sets || 2}<div class="sub" style="font-size:9px">SETS</div></div><button class="icon-btn" data-sets="${di}:${si}:1" aria-label="More sets">+</button></div>
          <button class="icon-btn" data-smenu="${di}:${si}" aria-label="Slot menu">${icon('more', 16)}</button></div>`; }).join('')}
        <button class="btn small block" style="margin-top:8px" data-addmuscle="${di}">${icon('plus')} Add a muscle group</button></div>`).join('')}
      <button class="btn block" id="addday">${icon('plus')} Add a day</button>
      ${muscles.length ? `<button class="btn block" id="prio">${icon('list')} Muscle priorities</button>` : ''}
      <div class="card" style="display:flex;flex-direction:column;gap:10px">
        <div class="field"><label>Meso name</label><input class="input" id="mname" value="${esc(B.name)}" placeholder="Chest and tri 12-2026"></div>
        <div class="row"><div class="grow"><div class="lab">Weeks</div><div class="sub">${E.rirSchedule(B.weeks, B.deload).map((r) => (r >= 8 ? 'DL' : r)).join(' · ')} RIR</div></div>
          <div class="row"><button class="icon-btn" id="wk-" style="border:1px solid var(--line2)">−</button><div style="width:32px;text-align:center;font-size:20px;font-weight:800">${B.weeks}</div><button class="icon-btn" id="wk+" style="border:1px solid var(--line2)">+</button></div></div>
        <label class="toggle"><span>Last week is a deload</span><span class="switch"><input type="checkbox" id="dl" ${B.deload ? 'checked' : ''}><span></span></span></label>
      </div>
      <button class="btn primary block" id="create" style="height:54px">${icon('check')} Create meso</button>
      <button class="link-btn" id="discard" style="align-self:center;color:var(--muted)">Discard draft</button>`;
    // fill suggestions for slots without a carried-over start
    B.days.forEach((d, di) => d.slots.forEach(async (s, si) => {
      if (!s.exercise_id || (s.start && s.start.reps)) return;
      const g = await suggestion(s.exercise_id, rir1);
      const el = document.querySelector(`[data-sug="${di}:${si}"]`);
      if (el && g) el.textContent = `${g.confidence === 'hint' ? 'Hint: about' : 'Suggested'} ${g.weight != null ? `${fmtW(g.weight)} × ` : ''}${g.reps} · ${g.label}`;
    }));
  };
  draw();
  const slot = (key) => { const [di, si] = key.split(':').map(Number); return [B.days[di], si, di]; };
  app().oninput = (e) => {
    const t = e.target;
    if (t.dataset.dlabel) { B.days[Number(t.dataset.dlabel)].label = t.value; save(); }
    if (t.id === 'mname') { B.name = t.value; save(); }
  };
  app().onchange = (e) => {
    const t = e.target;
    if (t.dataset.dwd) { B.days[Number(t.dataset.dwd)].weekday = t.value === '' ? null : Number(t.value); save(); }
    if (t.id === 'dl') { B.deload = t.checked; draw(); }
  };
  app().onclick = async (e) => {
    const t = e.target.closest('button'); if (!t) return;
    const d = t.dataset;
    try {
      if (d.sets) { const [di, si, dv] = d.sets.split(':').map(Number); const s = B.days[di].slots[si]; s.sets = Math.max(1, Math.min(6, (s.sets || 2) + dv)); draw(); }
      if (d.pick) {
        const [day, si] = slot(d.pick); const s = day.slots[si];
        const { picker } = await import('./exercises.js');
        const ex = await picker({ title: `${s.muscle}: pick an exercise`, muscle: s.muscle, similarTo: s.exercise_id || null });
        if (ex) { day.slots[si] = { ...s, exercise_id: ex.id, exercise: ex.name, start: null }; draw(); }
      }
      if (d.smenu) {
        const [day, si] = slot(d.smenu);
        menu('', [
          ...(si > 0 ? [{ label: 'Move up', icon: 'up', run: () => { [day.slots[si - 1], day.slots[si]] = [day.slots[si], day.slots[si - 1]]; draw(); } }] : []),
          ...(si < day.slots.length - 1 ? [{ label: 'Move down', icon: 'down', run: () => { [day.slots[si + 1], day.slots[si]] = [day.slots[si], day.slots[si + 1]]; draw(); } }] : []),
          { label: 'Clear exercise', icon: 'edit', run: () => { day.slots[si] = { ...day.slots[si], exercise_id: null, exercise: null, start: null }; draw(); } },
          { label: 'Remove', icon: 'trash', danger: true, run: () => { day.slots.splice(si, 1); draw(); } },
        ]);
      }
      if (d.addmuscle) {
        const day = B.days[Number(d.addmuscle)];
        menu('Add a muscle group', ctx.muscles.map((m) => ({ label: m, run: async () => {
          const { picker } = await import('./exercises.js');
          const ex = await picker({ title: `${m}: pick an exercise`, muscle: m });
          day.slots.push({ muscle: m, exercise_id: ex ? ex.id : null, exercise: ex ? ex.name : null, sets: ctx.settings.startSets || 2 }); draw();
        } })));
      }
      if (d.dmenu) {
        const i = Number(d.dmenu);
        menu(esc(B.days[i].label), [
          ...(i > 0 ? [{ label: 'Move day up', icon: 'up', run: () => { [B.days[i - 1], B.days[i]] = [B.days[i], B.days[i - 1]]; draw(); } }] : []),
          { label: 'Duplicate day', icon: 'copy', run: () => { B.days.splice(i + 1, 0, JSON.parse(JSON.stringify({ ...B.days[i], label: `${B.days[i].label} copy` }))); draw(); } },
          { label: 'Remove day', icon: 'trash', danger: true, run: () => { if (B.days.length > 1) { B.days.splice(i, 1); draw(); } else toast('A meso needs at least one day'); } },
        ]);
      }
      if (t.id === 'addday') { if (B.days.length >= 7) return toast('7 days is the most'); B.days.push({ label: `Day ${B.days.length + 1}`, weekday: null, slots: [] }); draw(); }
      if (t.id === 'wk-') { B.weeks = Math.max(3, B.weeks - 1); draw(); }
      if (t.id === 'wk+') { B.weeks = Math.min(8, B.weeks + 1); draw(); }
      if (t.id === 'prio') prioritySheet(draw);
      if (t.id === 'board') {
        menu('Board', [
          { label: 'Autofill exercises', sub: 'fills empty slots', icon: 'bolt', run: autofill },
          { label: 'Add a day', icon: 'plus', run: () => { B.days.push({ label: `Day ${B.days.length + 1}`, weekday: null, slots: [] }); draw(); } },
          { label: 'Muscle priorities', icon: 'list', run: () => prioritySheet(draw) },
          { label: 'Update start day', sub: 'shift weekdays', icon: 'calendar', run: shiftDays },
          { label: 'Clear exercises', icon: 'edit', run: () => { B.days.forEach((x) => x.slots.forEach((s) => { s.exercise_id = null; s.exercise = null; s.start = null; })); draw(); } },
          { label: 'Reset board', icon: 'trash', danger: true, run: async () => { if (await confirmSheet('Reset the board?', 'Clears every day and slot.', { ok: 'Reset', danger: true })) { B = blank(); draw(); } } },
        ]);
      }
      if (t.id === 'discard') { if (await confirmSheet('Discard this draft?', '', { ok: 'Discard', danger: true })) { clear(); B = null; go('new'); } }
      if (t.id === 'create') {
        const empty = B.days.flatMap((x) => x.slots).filter((s) => !s.exercise_id).length;
        if (empty) return toast(`${empty} slot${empty > 1 ? 's need' : ' needs'} an exercise. Try Autofill in the board menu.`);
        const r = await api.post('mesos', { ...B, name: B.name || 'New meso' });
        clear(); B = null; toast('Meso created. Let\'s train!');
        await loadHome();
        const m = await api.get(`mesos/${r.id}`);
        go(m.nextId ? `workout/${m.nextId}` : `meso/${r.id}`);
      }
    } catch (err) { toast(err.message); }
  };
  async function autofill() {
    const taken = B.days.flatMap((x) => x.slots.map((s) => s.exercise_id));
    for (const day of B.days) {
      const r = await api.post('autofill', { slots: day.slots, taken });
      day.slots = r.slots; for (const s of day.slots) taken.push(s.exercise_id);
    }
    draw(); toast('Empty slots filled');
  }
  function shiftDays() {
    menu('First training day', WEEKDAY.map((w, i) => ({ label: w, run: () => {
      const first = B.days[0].weekday ?? 1; const shift = i - first;
      B.days.forEach((x, k) => { x.weekday = ((x.weekday ?? (first + k)) + shift + 7) % 7; }); draw();
    } })));
  }
}
function prioritySheet(after) {
  const muscles = Array.from(new Set(B.days.flatMap((d) => d.slots.map((s) => s.muscle))));
  sheet(`<div class="h2">Muscle priorities</div><p class="sub">Emphasize gets sets added fastest. Maintain stays low and steady.</p>
    <div id="pr">${muscles.map((mu) => `<div class="row" style="padding:6px 0;border-top:1px solid var(--line)"><div class="grow" style="font-weight:700">${esc(mu)}</div>
      <div class="seg" data-mu="${esc(mu)}" style="flex:none">${['emphasize', 'grow', 'maintain'].map((v) => `<button data-v="${v}" class="${(B.priorities[mu] || 'grow') === v ? 'on' : ''}" style="font-size:12px;min-height:34px;padding:0 8px">${PRIORITY[v]}</button>`).join('')}</div></div>`).join('')}</div>
    <button class="btn primary block" style="margin-top:12px" data-ok>Done</button>`, {
    onMount: (el, close) => {
      el.querySelector('#pr').onclick = (e) => { const b = e.target.closest('[data-v]'); if (!b) return; B.priorities[b.parentElement.dataset.mu] = b.dataset.v; $$('button', b.parentElement).forEach((q) => q.classList.toggle('on', q === b)); };
      el.querySelector('[data-ok]').onclick = () => { close(); after(); };
    },
  });
}
