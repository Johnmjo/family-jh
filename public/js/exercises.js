// Exercise library, exercise page (how-to + history), custom exercises, and the exercise picker.
import { api, esc, icon, toast, sheet, confirmSheet, mColor, fmtW, fmtDate, lineChart, $, $$ } from './ui.js';
import { ctx, exercises, go, query } from './app.js';

const app = () => document.getElementById('app');
let F = { q: '', muscle: '', equipment: '', done: false, custom: false };

function filterList(all, f, prefer) {
  const q = f.q.trim().toLowerCase();
  const pref = ctx.settings.filterPreferred && prefer ? new Set(ctx.settings.preferredEquipment) : null;
  return all.filter((e) => (!q || e.name.toLowerCase().includes(q)) && (!f.muscle || e.muscle === f.muscle) && (!f.equipment || e.equipment === f.equipment)
    && (!f.done || e.done) && (!f.custom || e.custom) && (!pref || pref.has(e.equipment) || f.equipment));
}
const row = (e) => `<button class="list-item" data-ex="${e.id}" style="width:100%;border-left:0;border-right:0;border-bottom:0;background:none;text-align:left">
  <div class="stripe" style="background:${mColor(e.muscle)}"></div><div class="grow"><div style="font-weight:700" class="ell">${esc(e.name)}</div>
  <div class="sub">${esc(e.muscle)} · ${esc(e.equipment)}${e.custom ? ' · yours' : ''}${e.done ? ' · done before' : ''}</div></div>${icon('right', 16)}</button>`;
function filters(f) {
  return `<input class="input" id="fq" placeholder="Search exercises" value="${esc(f.q)}" autocomplete="off">
  <div class="chips" style="margin-top:8px"><button class="chip ${!f.muscle ? 'on' : ''}" data-m="">All</button>${ctx.muscles.map((m) => `<button class="chip ${f.muscle === m ? 'on' : ''}" data-m="${m}">${m}</button>`).join('')}</div>
  <div class="row" style="margin-top:8px;gap:6px;flex-wrap:wrap">
    <select class="input" id="feq" style="flex:1;min-width:150px;height:38px;font-size:14px"><option value="">Any equipment${ctx.settings.filterPreferred ? ' (preferred)' : ''}</option>${ctx.equipment.map((q) => `<option ${f.equipment === q ? 'selected' : ''}>${q}</option>`).join('')}</select>
    <button class="chip ${f.done ? 'on' : ''}" data-done>Done before</button><button class="chip ${f.custom ? 'on' : ''}" data-custom>Mine</button></div>`;
}
function bindFilters(root, f, redraw) {
  const q = $('#fq', root);
  q.oninput = () => { f.q = q.value; redraw(true); };
  $$('[data-m]', root).forEach((b) => b.onclick = () => { f.muscle = b.dataset.m; redraw(); });
  $('#feq', root).onchange = (e) => { f.equipment = e.target.value; redraw(); };
  $('[data-done]', root).onclick = () => { f.done = !f.done; redraw(); };
  $('[data-custom]', root).onclick = () => { f.custom = !f.custom; redraw(); };
}

export async function library() {
  const all = await exercises(true);
  const draw = (keepFocus) => {
    const list = filterList(all, F, true);
    if (keepFocus) { $('#exlist').innerHTML = list.slice(0, 150).map(row).join('') || '<div class="empty">No matches</div>'; return; }
    app().innerHTML = `<div class="row" style="margin-top:4px"><div class="h1 grow">Exercises</div><button class="btn small primary" id="newex">${icon('plus')} Custom</button></div>
      ${filters(F)}<div class="card" style="padding:0 12px" id="exlist">${list.slice(0, 150).map(row).join('') || '<div class="empty">No matches</div>'}</div>
      <p class="sub">${list.length} of ${all.length} exercises${list.length > 150 ? ', showing 150. Search to narrow it down.' : ''}</p>`;
    bindFilters(app(), F, draw);
    $('#newex').onclick = () => customForm();
  };
  draw();
  app().onclick = (e) => { const b = e.target.closest('[data-ex]'); if (b) go(`exercise/${b.dataset.ex}`); };
}

export async function detail(id) {
  const d = await api.get(`exercises/${id}`);
  let tab = query().get('tab') || (d.history.length ? 'history' : 'howto');
  const u = d.units;
  const draw = () => {
    const h = d.howto;
    const list = (arr, tag = 'ul') => (arr && arr.length ? `<${tag}>${arr.map((x) => `<li>${esc(x)}</li>`).join('')}</${tag}>` : '<p class="sub">Nothing written yet.</p>');
    app().innerHTML = `<button class="link-btn" id="back">${icon('back', 16)} Back</button>
      <div><div class="eyebrow">${tab === 'howto' ? 'How to' : 'Exercise history'}</div><div class="h1">${esc(d.name)}</div>
      <div class="chips" style="margin-top:6px">${h.muscles.map((m) => `<span class="pill gray">${esc(m)}</span>`).join('')}<span class="pill gray">${esc(d.equipment)}</span>${d.custom ? '<span class="pill amber">Yours</span>' : ''}</div></div>
      <div class="seg"><button class="${tab === 'howto' ? 'on' : ''}" data-tab="howto">How-to</button><button class="${tab === 'history' ? 'on' : ''}" data-tab="history">History</button></div>
      ${tab === 'howto' ? `<div class="card howto">
        <h4>Setup</h4>${list(h.setup)}<h4>How to do it</h4>${list(h.steps, 'ol')}<h4>Key cues</h4>${list(h.cues)}<h4>Common mistakes</h4>${list(h.mistakes)}
        ${d.link ? `<h4>Form link</h4><p><a href="${esc(d.link)}" target="_blank" rel="noopener">${esc(d.link)}</a></p>` : ''}
        ${d.custom ? '<button class="btn small" style="margin-top:12px" id="editex">' + icon('edit') + ' Edit</button>' : ''}</div>
        <div class="section">Your notes</div><div class="card">${d.notes.map((n) => `<div class="list-item"><div class="grow">${n.pinned ? `<span class="pill amber" style="margin-right:6px">Pinned</span>` : ''}${esc(n.text)}</div><button class="icon-btn" data-pin="${n.id}" data-p="${n.pinned ? 0 : 1}" aria-label="${n.pinned ? 'Unpin' : 'Pin'}">${icon('note', 16)}</button><button class="icon-btn" data-delnote="${n.id}" aria-label="Delete note">${icon('trash', 16)}</button></div>`).join('') || '<p class="sub" style="margin:0">Pinned notes show every time this exercise comes up, like "seat on 4".</p>'}
          <button class="btn small" style="margin-top:8px" id="addnote">${icon('plus')} Add a pinned note</button></div>
        ${d.similar.length ? `<div class="section">Similar exercises${d.familyLabel ? ` · ${esc(d.familyLabel)}` : ''}</div><div class="card" style="padding:0 12px">${d.similar.slice(0, 12).map((e) => `<button class="list-item" data-ex="${e.id}" style="width:100%;background:none;border-left:0;border-right:0;border-bottom:0;text-align:left"><div class="grow">${esc(e.name)}<div class="sub">${esc(e.equipment)}</div></div>${icon('right', 16)}</button>`).join('')}</div>` : ''}`
      : `<div class="card"><div class="row"><div class="grow" style="font-weight:600;font-size:13px">Estimated 1-rep max</div><div style="font-size:22px;font-weight:800">${d.prs.e1rm ? `${fmtW(d.prs.e1rm)} ${u}` : '—'}</div></div>
          ${lineChart(d.chart.map((c) => ({ x: c.date, y: c.e1rm })))}
          <div class="row sub" style="justify-content:space-between"><span>${d.chart[0] ? fmtDate(d.chart[0].date) : ''}</span><span>${d.chart.length ? fmtDate(d.chart.at(-1).date) : ''}</span></div>
          <div class="row" style="margin-top:8px;gap:6px;flex-wrap:wrap"><span class="pill gray">Heaviest ${d.prs.heaviest != null ? `${fmtW(d.prs.heaviest)} ${u}` : '—'}</span>${d.prs.tested ? `<span class="pill amber">Tested 1RM ${fmtW(d.prs.tested)} ${u}</span>` : ''}</div></div>
        ${d.history.length ? groups(d.history, u, d.equipment) : '<div class="empty">You haven\'t logged this exercise yet.</div>'}`}`;
  };
  draw();
  app().onclick = async (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.id === 'back') { if (history.length > 1) history.back(); else go('exercises'); return; }
    if (t.dataset.tab) { tab = t.dataset.tab; draw(); return; }
    if (t.dataset.ex) { go(`exercise/${t.dataset.ex}`); return; }
    try {
      if (t.id === 'addnote') {
        const { promptSheet } = await import('./ui.js');
        const v = await promptSheet('Pinned note', { placeholder: 'Seat on 4, spotter arms on 3...', multiline: true });
        if (v && v.value) { await api.post(`exercises/${id}/notes`, { text: v.value, pinned: true }); return detail(id); }
      }
      if (t.dataset.delnote) { await api.del(`notes/${t.dataset.delnote}`); return detail(id); }
      if (t.dataset.pin) { await api.put(`notes/${t.dataset.pin}`, { pinned: t.dataset.p === '1' }); return detail(id); }
      if (t.id === 'editex') return customForm(d);
    } catch (err) { toast(err.message); }
  };
}
function groups(hist, u, equipment) {
  let html = ''; let lastMeso = null;
  for (const g of hist) {
    if (g.meso !== lastMeso) { html += `${lastMeso !== null ? '</div>' : ''}<div class="section">${esc(g.meso)}</div><div class="card" style="padding:2px 14px">`; lastMeso = g.meso; }
    const work = g.sets.filter((s) => s.kind !== 'warmup');
    const byW = {};
    for (const s of work) (byW[s.weight ?? 'BW'] = byW[s.weight ?? 'BW'] || []).push(s.kind === 'attempt' ? `1RM ${s.result === 'made' ? '✓' : '✗'}` : s.reps);
    const txt = Object.entries(byW).map(([w, reps]) => `<span style="font-size:16px;font-weight:800">${equipment === 'Bodyweight only' ? 'BW' : `${w} ${w === 'BW' ? '' : u}`}</span> <span class="muted" style="font-weight:600">× ${reps.join(', ')}</span>`).join('<br>');
    html += `<div class="list-item"><div class="grow">${txt}${g.deload ? ' <span class="pill gray" style="font-size:10px">DELOAD</span>' : ''}</div><div style="text-align:right"><div style="font-size:12px;font-weight:700">Wk ${g.week} · Day ${g.day}</div><div class="sub">${fmtDate(g.date)}</div></div></div>`;
  }
  return `${html}</div>`;
}

// Create or edit a custom exercise
export function customForm(existing = null) {
  const e = existing || { name: '', muscle: '', equipment: '', family: '', ratio: 1, link: '', howto: { setup: [], steps: [], cues: [], mistakes: [] } };
  const ta = (k, label) => `<div class="field"><label>${label} (one per line)</label><textarea class="input" data-h="${k}">${esc((e.howto[k] || []).join('\n'))}</textarea></div>`;
  sheet(`<div class="h2">${existing ? 'Edit exercise' : 'New custom exercise'}</div>
    <div style="display:flex;flex-direction:column;gap:10px;margin-top:10px">
    <div class="field"><label>Name</label><input class="input" id="cn" value="${esc(e.name)}"></div>
    <div class="row"><div class="field grow"><label>Muscle group</label><select class="input" id="cm"><option value="">Pick</option>${ctx.muscles.map((m) => `<option ${e.muscle === m ? 'selected' : ''}>${m}</option>`).join('')}</select></div>
    <div class="field grow"><label>Equipment</label><select class="input" id="ce"><option value="">Pick</option>${ctx.equipment.map((m) => `<option ${e.equipment === m ? 'selected' : ''}>${m}</option>`).join('')}</select></div></div>
    <div class="row"><div class="field grow"><label>Family (for suggestions, optional)</label><select class="input" id="cf"><option value="">Standalone</option>${ctx.families.map((f) => `<option value="${f.id}" ${e.family === f.id ? 'selected' : ''}>${esc(f.label)}</option>`).join('')}</select></div>
    <div class="field" style="width:110px"><label>Ratio to main lift</label><input class="input" id="cr" inputmode="decimal" value="${e.ratio ?? 1}"></div></div>
    ${ta('setup', 'Setup')}${ta('steps', 'How to do it')}${ta('cues', 'Key cues')}${ta('mistakes', 'Common mistakes')}
    <div class="field"><label>Form link (optional)</label><input class="input" id="cl" value="${esc(e.link || '')}" placeholder="https://"></div>
    <div class="row"><button class="btn grow" data-no>Cancel</button><button class="btn primary grow" data-ok>${existing ? 'Save' : 'Add exercise'}</button></div>
    ${existing ? `<button class="btn danger block" data-del>${icon('trash')} Delete exercise</button>` : ''}</div>`, {
    onMount: (el, close) => {
      el.querySelector('[data-no]').onclick = close;
      el.querySelector('[data-ok]').onclick = async () => {
        const body = { name: $('#cn', el).value, muscle: $('#cm', el).value, equipment: $('#ce', el).value, family: $('#cf', el).value, ratio: $('#cr', el).value, link: $('#cl', el).value };
        for (const t of $$('[data-h]', el)) body[t.dataset.h] = t.value;
        try {
          if (existing) { await api.put(`exercises/${existing.id}`, body); close(); detail(existing.id); } else { const r = await api.post('exercises', body); close(); await exercises(true); toast('Exercise added'); go(`exercise/${r.id}?tab=howto`); }
        } catch (err) { toast(err.message); }
      };
      const del = el.querySelector('[data-del]');
      if (del) del.onclick = async () => { if (!(await confirmSheet('Delete this exercise?', 'Only possible if you have never logged it.', { ok: 'Delete', danger: true }))) return; try { await api.del(`exercises/${existing.id}`); close(); await exercises(true); go('exercises'); } catch (err) { toast(err.message); } };
    },
  });
}

// Bottom-sheet picker. Resolves with the chosen exercise or null.
export async function picker({ title, muscle = null, similarTo = null }) {
  const all = await exercises();
  const similar = similarTo ? await api.get(`exercises/${similarTo}/similar`) : null;
  const f = { q: '', muscle: muscle || '', equipment: '', done: false, custom: false };
  return new Promise((resolve) => {
    let picked = null;
    const s = sheet(`<div class="h2" style="margin-bottom:8px">${esc(title)}</div><div id="pf"></div><div id="pl" style="margin-top:6px"></div>`, {
      onMount: (el, close) => {
        const draw = (keep) => {
          if (!keep) { $('#pf', el).innerHTML = filters(f); bindFilters(el, f, draw); }
          const base = similar && !f.q && f.muscle === (muscle || '') && !f.equipment && !f.done && !f.custom ? similar : filterList(all, f, true);
          $('#pl', el).innerHTML = `${similar && base === similar ? '<div class="section">Similar first</div>' : ''}${base.slice(0, 120).map(row).join('') || '<div class="empty">No matches</div>'}`;
        };
        draw();
        $('#pl', el).onclick = (e) => { const b = e.target.closest('[data-ex]'); if (!b) return; picked = all.find((x) => x.id === Number(b.dataset.ex)); close(); };
      },
      onClose: () => resolve(picked),
    });
    return s;
  });
}
