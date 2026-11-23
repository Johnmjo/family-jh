// Meso overview (calendar grid + sets per week), the mesos list, priorities and the summary.
import { api, esc, icon, toast, sheet, menu, confirmSheet, promptSheet, mColor, PRIORITY, WEEKDAY, fmtDate, rirText, $$ } from './ui.js';
import { ctx, go, loadHome, query } from './app.js';

const app = () => document.getElementById('app');
const PCOL = { emphasize: '#f87171', grow: '#fbbf24', maintain: '#a1a1aa' };

export async function meso(id = null) {
  if (!id) {
    const h = await loadHome();
    if (!h.meso) return mesos();
    id = h.meso.id;
  }
  const m = await api.get(`mesos/${id}`);
  const pct = m.total ? Math.round(((m.done + m.skipped) / m.total) * 100) : 0;
  const weeksLbl = (w) => (m.deload && w === m.weeks ? 'Deload' : `Wk ${w}`);
  const grid = `<div class="card" style="overflow-x:auto"><div class="grid" style="grid-template-columns:58px repeat(${m.days.length}, minmax(44px,1fr))">
    <div></div>${m.days.map((d) => `<div class="tag ell" style="text-align:center;color:var(--muted)">${esc(d.label)}${d.weekday != null ? `<br><span style="font-weight:600">${WEEKDAY[d.weekday]}</span>` : ''}</div>`).join('')}
    ${Array.from({ length: m.weeks }, (_, i) => i + 1).map((w) => `<div><div style="font-size:14px;font-weight:700">${weeksLbl(w)}</div><div class="sub">${m.deload && w === m.weeks ? '' : rirText(m.rirs[w - 1])}</div></div>
      ${m.days.map((d) => { const o = d.workouts.find((x) => x.week === w); if (!o) return '<div></div>'; return `<a class="cellw ${o.next ? 'next' : o.status}" href="workout/${o.id}" data-link aria-label="${esc(d.label)} week ${w}">${o.status === 'done' ? icon('check', 16, 3) : o.next ? 'NEXT' : o.status === 'skipped' ? 'skip' : ''}</a>`; }).join('')}`).join('')}
    </div></div>`;
  const order = { emphasize: 0, grow: 1, maintain: 2 };
  const mus = Object.entries(m.muscles).sort((a, b) => (order[m.priorities[a[0]] || 'grow'] - order[m.priorities[b[0]] || 'grow']) || a[0].localeCompare(b[0]));
  const maxSets = Math.max(1, ...mus.flatMap(([, ws]) => ws.map((x) => (x ? x.planned : 0))));
  const bars = mus.map(([name, ws]) => {
    const p = m.priorities[name] || 'grow';
    return `<div class="row" style="padding:5px 0;border-top:1px solid var(--line);align-items:flex-end;gap:12px">
      <div style="width:100px"><div style="font-weight:700;font-size:15px">${esc(name)}</div><div class="tag" style="color:${PCOL[p]}">${PRIORITY[p]}</div></div>
      <div class="bars">${ws.map((x) => `<div><b>${x ? x.planned : ''}</b><i style="height:${x ? Math.max(4, Math.round((x.planned / maxSets) * 28)) : 4}px;background:${x ? mColor(name) : 'var(--line)'};opacity:${x && x.done >= x.planned ? 1 : x ? 0.55 : 0.4}"></i></div>`).join('')}</div></div>`;
  }).join('');
  app().innerHTML = `
    <div class="row" style="margin-top:4px"><div class="grow"><div class="eyebrow">${m.current ? 'Current meso' : m.status === 'finished' ? 'Finished meso' : 'Meso'}</div><div class="h1">${esc(m.name)}</div>
      <div class="sub">Started ${fmtDate(m.created_at)} · ${m.days.length} days a week · ${m.weeks} weeks${m.deload ? ' incl. deload' : ''}</div></div>
      <button class="icon-btn" id="mmenu" aria-label="Meso menu">${icon('more', 20)}</button></div>
    <div><div class="row" style="justify-content:space-between;font-size:13px;font-weight:600;margin-bottom:6px"><span>${m.done + m.skipped} of ${m.total} workouts</span><span class="muted">${pct}%</span></div><div class="progress"><i style="width:${pct}%"></i></div></div>
    ${grid}
    ${mus.length ? `<div class="card" style="padding:10px 14px 4px"><div class="row" style="justify-content:space-between"><div class="section" style="margin:0">Sets per week</div><div class="sub">${Array.from({ length: m.weeks }, (_, i) => (m.deload && i + 1 === m.weeks ? 'DL' : i + 1)).join(' · ')}</div></div>${bars}</div>
      <p class="sub">Later weeks fill in after each week's check-ins. Faded bars aren't finished yet.</p>` : ''}
    <div class="section">Notes</div><div class="card">${m.notes.map((n) => `<div class="list-item"><div class="grow">${esc(n.text)}<div class="sub">${fmtDate(n.created_at)}</div></div><button class="icon-btn" data-delnote="${n.id}" aria-label="Delete note">${icon('trash', 16)}</button></div>`).join('') || '<p class="sub" style="margin:0">No notes yet.</p>'}
      <button class="btn small" style="margin-top:8px" id="addnote">${icon('plus')} Add a note</button></div>
    <div class="row"><a class="btn grow" href="summary/${m.id}" data-link>${icon('chart')} Summary</a><a class="btn grow" href="mesos" data-link>${icon('list')} All mesos</a></div>`;
  if (query().get('notes')) document.getElementById('addnote').scrollIntoView();
  app().onclick = async (e) => {
    const t = e.target.closest('button'); if (!t) return;
    try {
      if (t.id === 'mmenu') return mesoMenu(m);
      if (t.id === 'addnote') { const v = await promptSheet('Meso note', { multiline: true }); if (v && v.value) { await api.post(`mesos/${m.id}/action`, { action: 'note', text: v.value }); meso(m.id); } }
      if (t.dataset.delnote) { await api.del(`notes/${t.dataset.delnote}`); meso(m.id); }
    } catch (err) { toast(err.message); }
  };
}

export function mesoMenu(m, after = () => meso(m.id)) {
  const run = async (body, msg) => { try { await api.post(`mesos/${m.id}/action`, body); if (msg) toast(msg); after(); } catch (e) { toast(e.message); } };
  menu(esc(m.name), [
    { label: 'Rename', icon: 'edit', run: async () => { const v = await promptSheet('Meso name', { value: m.name }); if (v && v.value) run({ action: 'rename', name: v.value }); } },
    { label: 'Muscle priorities', icon: 'list', run: () => prioritiesSheet(m.id, after) },
    { label: 'Copy meso', sub: 'start the next one from this', icon: 'copy', run: () => go(`new/copy/${m.id}`) },
    { label: 'Summary', icon: 'chart', run: () => go(`summary/${m.id}`) },
    { label: 'Save as template', icon: 'grid', run: async () => { const v = await promptSheet('Template name', { value: m.name }); if (v && v.value) run({ action: 'saveTemplate', name: v.value }, 'Saved to your templates'); } },
    { label: 'Add a week', icon: 'plus', run: () => run({ action: 'addWeek' }, 'Week added') },
    { label: 'Remove a week', icon: 'trash', run: () => run({ action: 'removeWeek' }, 'Week removed') },
    ...(!m.current ? [{ label: 'Make this the current meso', icon: 'check', run: () => run({ action: 'makeCurrent' }) }] : []),
    ...(m.status !== 'finished' ? [{ label: 'End meso', icon: 'skip', danger: true, run: async () => { if (await confirmSheet('End this meso?', 'It moves to your finished mesos. You can still copy it.', { ok: 'End meso', danger: true })) run({ action: 'end' }); } }] : []),
    { label: 'Delete meso', icon: 'trash', danger: true, run: async () => {
      const v = await confirmSheet('Delete this meso?', 'All its workouts and logged sets are deleted for good. Type delete to confirm.', { ok: 'Delete', danger: true, typeToConfirm: 'delete' });
      if (v) { try { await api.post(`mesos/${m.id}/action`, { action: 'delete', confirm: v }); toast('Meso deleted'); go('mesos'); } catch (e) { toast(e.message); } }
    } },
  ]);
}

export async function prioritiesSheet(id, after) {
  const m = await api.get(`mesos/${id}`);
  const muscles = Array.from(new Set([...Object.keys(m.muscles), ...Object.keys(m.priorities)]));
  const p = { ...m.priorities };
  sheet(`<div class="h2">Muscle priorities</div><p class="sub">Emphasize adds sets fastest when you recover well. Grow adds sets when needed. Maintain holds a low, steady volume.</p>
    <div id="pr">${muscles.map((mu) => `<div class="row" style="padding:6px 0;border-top:1px solid var(--line)"><div class="grow" style="font-weight:700">${esc(mu)}</div>
      <div class="seg" data-mu="${esc(mu)}" style="flex:none">${['emphasize', 'grow', 'maintain'].map((v) => `<button data-v="${v}" class="${(p[mu] || 'grow') === v ? 'on' : ''}" style="font-size:12px;min-height:34px;padding:0 8px">${PRIORITY[v]}</button>`).join('')}</div></div>`).join('')}</div>
    <button class="btn primary block" style="margin-top:12px" data-ok>Save</button>`, {
    onMount: (el, close) => {
      el.querySelector('#pr').onclick = (e) => { const b = e.target.closest('[data-v]'); if (!b) return; const mu = b.parentElement.dataset.mu; p[mu] = b.dataset.v; $$('button', b.parentElement).forEach((q) => q.classList.toggle('on', q === b)); };
      el.querySelector('[data-ok]').onclick = async () => { close(); try { await api.post(`mesos/${id}/action`, { action: 'priorities', priorities: p }); toast('Priorities saved'); if (after) after(); } catch (e) { toast(e.message); } };
    },
  });
}

export async function mesos() {
  const list = await api.get('mesos');
  app().innerHTML = `<div class="row" style="margin-top:4px"><div class="h1 grow">Mesocycles</div><a class="btn small primary" href="new" data-link>${icon('plus')} New</a></div>
    ${list.length ? list.map((m) => `<div class="tile ${m.current ? 'primary' : ''}"><a class="grow" href="meso/${m.id}" data-link style="color:inherit"><div style="font-weight:800;font-size:16px" class="ell">${esc(m.name)}</div>
      <div class="sub">${m.weeks} weeks · ${m.days} days a week · ${m.done}/${m.total} done</div></a>
      ${m.current ? '<span class="pill amber">Current</span>' : m.status === 'finished' ? `<span class="pill green">${fmtDate(m.finished_at)}</span>` : ''}
      <button class="icon-btn" data-menu="${m.id}" aria-label="Meso menu">${icon('more', 18)}</button></div>`).join('') : '<div class="empty">No mesos yet. Start one from the New tab.</div>'}`;
  app().onclick = (e) => { const b = e.target.closest('[data-menu]'); if (!b) return; const m = list.find((x) => x.id === Number(b.dataset.menu)); mesoMenu({ ...m }, mesos); };
}

export async function summary(id) {
  const s = await api.get(`mesos/${id}/summary`);
  const u = s.units;
  const weeks = Array.from({ length: s.weeks }, (_, i) => i + 1);
  let pickWeek = Math.min(s.weeks, Math.max(1, ...Object.values(s.muscles).flatMap((ws) => ws.map((x, i) => (x && x.done ? i + 1 : 1)))));
  const avg = (ws) => { const v = ws.filter((x) => x && x.done).map((x) => x.done); return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1) : '—'; };
  const draw = () => {
    app().innerHTML = `<div class="eyebrow" style="margin-top:4px">Meso summary</div><div class="h1">${esc(s.name)}</div>
      <div class="row" style="gap:8px">${[['Done', s.done, 'green'], ['Skipped', s.skipped, 'gray'], ['Left', s.incomplete, 'amber']].map(([l, v, c]) => `<div class="card grow" style="text-align:center;padding:10px"><div style="font-size:24px;font-weight:800">${v}</div><div class="pill ${c}" style="margin-top:2px">${l}</div></div>`).join('')}</div>
      <div class="card"><div class="row"><div class="grow" style="font-weight:700">Working sets logged</div><div style="font-size:20px;font-weight:800">${s.totalSets}</div></div></div>
      <div class="section">Muscle group stats · sets per week</div>
      <div class="card" style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:14px"><tr class="sub"><th style="text-align:left">Muscle</th>${weeks.map((w) => `<th>${s.deload && w === s.weeks ? 'DL' : w}</th>`).join('')}<th>Avg</th></tr>
        ${Object.entries(s.muscles).map(([mu, ws]) => `<tr style="border-top:1px solid var(--line)"><td style="padding:6px 0;font-weight:700"><span style="color:${mColor(mu)}">●</span> ${esc(mu)}</td>${ws.map((x) => `<td style="text-align:center">${x ? x.done : ''}</td>`).join('')}<td style="text-align:center;font-weight:800">${avg(ws)}</td></tr>`).join('')}</table></div>
      <div class="section">Exercise stats</div>
      <div class="chips">${weeks.map((w) => `<button class="chip ${w === pickWeek ? 'on' : ''}" data-w="${w}">${s.deload && w === s.weeks ? 'Deload' : `Week ${w}`}</button>`).join('')}</div>
      <div class="card">${s.exercises.map((e) => `<div class="list-item"><div class="grow"><div style="font-weight:700">${esc(e.name)}</div><div class="sub">${e.weeks[pickWeek] ? esc(e.weeks[pickWeek].join(', ')) : 'Not logged this week'}</div></div>
        <div style="text-align:right"><div class="sub">Best</div><div style="font-weight:800">${e.best ? `${e.best.weight ?? 'BW'}×${e.best.reps}` : ''}</div></div></div>`).join('') || '<div class="empty">Nothing logged yet.</div>'}</div>
      <div class="row"><a class="btn grow" href="meso/${s.id}" data-link>${icon('calendar')} Calendar</a><a class="btn primary grow" href="new/copy/${s.id}" data-link>${icon('copy')} Start next meso</a></div>`;
  };
  draw();
  app().onclick = (e) => { const b = e.target.closest('[data-w]'); if (b) { pickWeek = Number(b.dataset.w); draw(); } };
  void u;
}
