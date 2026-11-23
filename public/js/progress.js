// Progress: PRs, estimated 1RM per exercise, sets per muscle, bodyweight.
import { api, esc, icon, toast, promptSheet, mColor, fmtW, fmtDate, lineChart } from './ui.js';
import { go } from './app.js';

const app = () => document.getElementById('app');

export async function progress() {
  const p = await api.get('progress');
  const u = p.units;
  const m = p.meso;
  const mus = m ? Object.entries(m.muscles) : [];
  const max = Math.max(1, ...mus.flatMap(([, ws]) => ws.map((x) => (x ? x.done : 0))));
  app().innerHTML = `<div class="h1" style="margin-top:4px">Progress</div>
    <div class="section">Recent PRs</div>
    <div class="card">${p.recent.length ? p.recent.map((r) => `<a class="list-item" href="exercise/${r.id}?tab=history" data-link style="color:inherit"><div class="grow"><div style="font-weight:700">${esc(r.name)}</div><div class="sub">${esc(r.type)} · ${fmtDate(r.at)}</div></div><div style="font-weight:800">${esc(r.text)}</div></a>`).join('') : '<p class="sub" style="margin:0">PRs show up here as you beat your best lifts.</p>'}</div>
    ${m ? `<div class="section">Sets done per week · ${esc(m.name)}</div><div class="card" style="padding:6px 14px">${mus.map(([name, ws]) => `<div class="row" style="padding:6px 0;border-top:1px solid var(--line);align-items:flex-end;gap:12px"><div style="width:92px;font-weight:700">${esc(name)}</div>
      <div class="bars" style="height:46px">${ws.map((x) => `<div><b>${x && x.done ? x.done : ''}</b><i style="height:${x && x.done ? Math.max(4, Math.round((x.done / max) * 30)) : 4}px;background:${x && x.done ? mColor(name) : 'var(--line)'}"></i></div>`).join('')}</div></div>`).join('') || '<p class="sub">Nothing logged yet.</p>'}</div>` : ''}
    <div class="section">Bodyweight</div>
    <div class="card"><div class="row"><div class="grow" style="font-weight:700">${p.bodyweights.length ? `${fmtW(p.bodyweights.at(-1).weight)} ${u}` : 'Not logged yet'}</div><button class="btn small" id="bw">${icon('plus')} Log</button></div>
      ${p.bodyweights.length > 1 ? lineChart(p.bodyweights.map((b) => ({ x: b.at, y: b.weight }))) : ''}</div>
    <div class="section">Your lifts · estimated 1RM</div>
    <div class="card" style="padding:0 12px">${p.exercises.length ? p.exercises.map((e) => `<a class="list-item" href="exercise/${e.id}?tab=history" data-link style="color:inherit"><div class="grow"><div style="font-weight:700" class="ell">${esc(e.name)}</div><div class="sub">${e.heaviest ? `Heaviest ${fmtW(e.heaviest.weight)} × ${e.heaviest.reps}` : ''}${e.tested ? ` · tested 1RM ${fmtW(e.tested.weight)}` : ''}</div></div><div style="font-weight:800;font-size:17px">${e.e1rm ? `${e.e1rm.value}` : '—'}<span class="sub"> ${u}</span></div>${icon('right', 16)}</a>`).join('') : '<div class="empty">Log a workout to see your lifts here.</div>'}</div>`;
  document.getElementById('bw').onclick = async () => {
    const v = await promptSheet(`Bodyweight (${u})`, { value: p.bodyweights.length ? fmtW(p.bodyweights.at(-1).weight) : '' });
    if (v && v.value) { try { await api.post('bodyweight', { weight: Number(v.value) }); progress(); } catch (e) { toast(e.message); } }
  };
  void go;
}
