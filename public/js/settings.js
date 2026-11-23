// Profile and settings. Everything here is per person.
import { api, E, esc, icon, toast, confirmSheet, fmtW, $, $$ } from './ui.js';
import { ctx, loadHome, go } from './app.js';

const app = () => document.getElementById('app');

export async function settings() {
  const h = await loadHome();
  const s = h.settings;
  const u = s.units;
  const num = (k, label, help = '') => `<div class="row" style="padding:6px 0;border-top:1px solid var(--line)"><div class="grow"><div style="font-weight:600">${label}</div>${help ? `<div class="sub">${help}</div>` : ''}</div><input class="input num" data-n="${k}" value="${fmtW(s[k])}" inputmode="decimal" style="width:90px;text-align:center"></div>`;
  const tog = (k, label, help = '') => `<label class="toggle" style="border-top:1px solid var(--line)"><div><div style="font-weight:600">${label}</div>${help ? `<div class="sub">${help}</div>` : ''}</div><span class="switch"><input type="checkbox" data-t="${k}" ${s[k] ? 'checked' : ''}><span></span></span></label>`;
  const bar = E.loadModel('Barbell', s);
  app().innerHTML = `
    <div class="row" style="margin-top:4px"><div style="width:52px;height:52px;border-radius:999px;background:${h.user.color};display:grid;place-items:center;font-size:22px;font-weight:800;color:#fff">${esc(h.user.name[0] || '?')}</div>
      <div class="grow"><input class="input" id="name" value="${esc(h.user.name)}" style="font-weight:800;font-size:18px" aria-label="Your name"><div class="sub" style="margin-top:2px">${esc(h.user.email)} · your training is private to you</div></div></div>

    <div class="section">Look</div>
    <div class="card"><div class="seg" id="theme"><button data-v="dark" class="${s.theme !== 'light' ? 'on' : ''}">Dark</button><button data-v="light" class="${s.theme === 'light' ? 'on' : ''}">Light</button></div></div>

    <div class="section">Units and weight steps</div>
    <div class="card"><div class="seg" id="units"><button data-v="lb" class="${u === 'lb' ? 'on' : ''}">Pounds (lb)</button><button data-v="kg" class="${u === 'kg' ? 'on' : ''}">Kilograms (kg)</button></div>
      <p class="sub">Switching units resets the steps and plates below to that unit's defaults. Logged weights are not converted.</p>
      ${num('barWeight', `Barbell (${u})`)}${num('smithBar', `Smith machine bar (${u})`, 'Many people count it as 0')}
      ${num('dumbbellStep', `Dumbbell steps (${u})`)}${num('cableStep', `Cable stack steps (${u})`)}${num('machineStep', `Machine steps (${u})`)}
      ${num('addedStep', `Added weight steps (${u})`, 'Dip belt, vest')}${num('assistStep', `Assisted machine steps (${u})`)}${num('minJump', `Smallest 1RM jump (${u})`)}</div>

    <div class="section">Plates you own</div>
    <div class="card"><div class="sub" style="margin-bottom:6px">Used for plates per side. Leave the count empty for "plenty".</div>
      <div id="plates">${s.plates.map((p, i) => `<div class="row" style="padding:4px 0"><input class="input" data-pw="${i}" value="${fmtW(p)}" inputmode="decimal" style="width:90px;text-align:center"><span class="sub">${u}, pairs:</span><input class="input" data-pc="${i}" value="${s.plateCounts && s.plateCounts[i] != null ? s.plateCounts[i] : ''}" inputmode="numeric" placeholder="plenty" style="width:90px;text-align:center"><button class="icon-btn" data-rmp="${i}" aria-label="Remove plate">${icon('trash', 16)}</button></div>`).join('')}</div>
      <div class="row" style="margin-top:6px"><button class="btn small" id="addplate">${icon('plus')} Add a plate size</button><button class="btn small primary" id="saveplates">Save plates</button></div>
      <div class="sub" style="margin-top:8px" id="platecheck">Check: 225 ${u} = ${esc(E.platesText(E.platesPerSide(E.roundLoad(225, bar), bar)))} per side</div></div>

    <div class="section">Rest timer</div>
    <div class="card">${num('restCompound', 'Rest goal for compounds (seconds)', 'Squats, presses, rows, deadlifts')}${num('restIsolation', 'Rest goal for isolations (seconds)', 'Curls, raises, extensions')}
      ${tog('chime', 'Chime and buzz at the rest goal', 'Works while JH is open on screen')}</div>

    <div class="section">Test 1RM warm-up ramp</div>
    <div class="card"><div class="sub">Percent of your expected max, reps, and rest (seconds) after each warm-up.</div>
      <div id="ramp">${s.ramp.map((r, i) => `<div class="row" style="padding:4px 0"><input class="input" data-rp="${i}" value="${r.pct}" inputmode="numeric" style="width:70px;text-align:center"><span class="sub">% ×</span><input class="input" data-rr="${i}" value="${r.reps}" inputmode="numeric" style="width:60px;text-align:center"><span class="sub">rest</span><input class="input" data-rs="${i}" value="${r.rest}" inputmode="numeric" style="width:70px;text-align:center">${r.optional ? '<span class="pill gray">optional</span>' : ''}</div>`).join('')}</div>
      <button class="btn small primary" id="saveramp" style="margin-top:6px">Save ramp</button></div>

    <div class="section">Training</div>
    <div class="card">${tog('suggestions', 'Suggest starting weights from my history')}${tog('roughGuesses', 'Also show rough guesses from similar exercises')}
      ${tog('autoMatch', 'Auto-match weight changes', 'Change one set and the later sets at the same weight follow')}
      ${num('startSets', 'Starting sets per exercise')}${num('setCap', 'Most sets per muscle in one workout')}
      ${tog('filterPreferred', 'Only show my preferred equipment in pickers')}
      <div class="chips" style="flex-wrap:wrap;margin-top:6px" id="equip">${ctx.equipment.map((q) => `<button class="chip ${s.preferredEquipment.includes(q) ? 'on' : ''}" data-eq="${esc(q)}">${esc(q)}</button>`).join('')}</div></div>

    <div class="section">Your data</div>
    <div class="card" style="display:flex;flex-direction:column;gap:8px">
      <a class="btn" href="api/export" download>${icon('copy')} Export all my data (JSON)</a>
      <div class="sub">Importing your history from your old app: export it there (Profile and Settings, then Export) and send the file over. The import gets built against your real file.</div>
      <a class="btn" href="mesos" data-link>${icon('list')} All mesos</a>
      <button class="btn danger" id="delall">${icon('trash')} Delete my JH data</button></div>
    <p class="sub" style="text-align:center">Jones Hypertrophy · signed in through the family login</p>`;

  const put = async (body, msg = 'Saved') => { try { const r = await api.put('settings', body); ctx.settings = r.settings; document.documentElement.dataset.theme = r.settings.theme; toast(msg); return r.settings; } catch (e) { toast(e.message); return null; } };
  $('#name').onchange = (e) => put({ name: e.target.value });
  $('#theme').onclick = async (e) => { const b = e.target.closest('[data-v]'); if (b) { await put({ theme: b.dataset.v }); settings(); } };
  $('#units').onclick = async (e) => { const b = e.target.closest('[data-v]'); if (b && b.dataset.v !== u) { await put({ units: b.dataset.v }, `Switched to ${b.dataset.v}`); settings(); } };
  $$('[data-n]').forEach((i) => i.onchange = () => put({ [i.dataset.n]: Number(i.value) }));
  $$('[data-t]').forEach((i) => i.onchange = () => put({ [i.dataset.t]: i.checked }));
  $('#equip').onclick = (e) => { const b = e.target.closest('[data-eq]'); if (!b) return; b.classList.toggle('on'); put({ preferredEquipment: $$('#equip .chip.on').map((x) => x.dataset.eq) }); };
  $('#addplate').onclick = () => { const d = document.createElement('div'); d.className = 'row'; d.style.padding = '4px 0'; const i = $$('[data-pw]').length; d.innerHTML = `<input class="input" data-pw="${i}" inputmode="decimal" style="width:90px;text-align:center" placeholder="${u}"><span class="sub">${u}, pairs:</span><input class="input" data-pc="${i}" inputmode="numeric" placeholder="plenty" style="width:90px;text-align:center">`; $('#plates').append(d); };
  $('#plates').onclick = (e) => { const b = e.target.closest('[data-rmp]'); if (b) b.parentElement.remove(); };
  $('#saveplates').onclick = async () => {
    const rows = $$('[data-pw]').map((w) => ({ w: Number(w.value), c: w.parentElement.querySelector('[data-pc]').value })).filter((r) => r.w > 0).sort((a, b) => b.w - a.w);
    const ns = await put({ plates: rows.map((r) => r.w), plateCounts: rows.map((r) => (r.c === '' ? null : Number(r.c))) }, 'Plates saved');
    if (ns) settings();
  };
  $('#saveramp').onclick = () => put({ ramp: s.ramp.map((r, i) => ({ pct: Number($(`[data-rp="${i}"]`).value), reps: Number($(`[data-rr="${i}"]`).value), rest: Number($(`[data-rs="${i}"]`).value), optional: r.optional })) }, 'Ramp saved');
  $('#delall').onclick = async () => {
    const v = await confirmSheet('Delete all your JH data?', 'This removes your mesos, history, notes, templates and settings in JH. Your family login and other apps are not touched. Type DELETE to confirm.', { ok: 'Delete everything', danger: true, typeToConfirm: 'DELETE' });
    if (!v) return;
    try { await api.post('delete-my-data', { confirm: v }); toast('Your JH data was deleted'); await loadHome(); go(''); } catch (e) { toast(e.message); }
  };
}
