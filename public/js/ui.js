// Small helpers shared by every screen: API calls (with an offline outbox for logging sets),
// bottom sheets, toasts, icons and formatting.
export const E = window.JHEngine;
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------- API ----------
const OUTBOX = 'jh-outbox';
const readBox = () => { try { return JSON.parse(localStorage.getItem(OUTBOX) || '[]'); } catch { return []; } };
const writeBox = (b) => { try { localStorage.setItem(OUTBOX, JSON.stringify(b)); } catch { /* private mode */ } showOffline(); };
const opId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
export class ApiError extends Error { constructor(msg, status) { super(msg); this.status = status; } }

async function send(method, url, body, id) {
  const res = await fetch(`api/${url}`, {
    method, credentials: 'same-origin',
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(id ? { 'X-Op-Id': id } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  if (!res.ok) throw new ApiError((data && data.error) || `Something went wrong (${res.status})`, res.status);
  return data;
}
export const api = {
  get: (url) => send('GET', url),
  post: (url, body = {}) => send('POST', url, body, opId()),
  put: (url, body = {}) => send('PUT', url, body, opId()),
  del: (url) => send('DELETE', url, undefined, opId()),
  // Logging: if the phone has no signal, keep the change and send it later
  async queued(method, url, body) {
    const id = opId();
    if (readBox().length) { writeBox([...readBox(), { method, url, body, id }]); flush(); return { queued: true }; }
    try { return await send(method, url, body, id); } catch (e) {
      if (e instanceof ApiError) throw e;
      writeBox([...readBox(), { method, url, body, id }]);
      return { queued: true };
    }
  },
};
let flushing = false;
export async function flush() {
  if (flushing) return;
  flushing = true;
  try {
    let box = readBox();
    while (box.length) {
      const op = box[0];
      try { await send(op.method, op.url, op.body, op.id); } catch (e) {
        if (!(e instanceof ApiError)) break; // still offline
        toast(`A saved change could not be applied: ${e.message}`);
      }
      box = readBox().slice(1); writeBox(box);
    }
    if (!readBox().length) window.dispatchEvent(new Event('jh:synced'));
  } finally { flushing = false; }
}
export const pending = () => readBox().length;
function showOffline() {
  const el = document.getElementById('offline'); if (!el) return;
  const n = readBox().length;
  el.hidden = !n;
  el.textContent = n ? `No signal. ${n} change${n > 1 ? 's' : ''} saved on this phone, sending when you're back online.` : '';
}
window.addEventListener('online', flush);
document.addEventListener('visibilitychange', () => { if (!document.hidden) flush(); });
setInterval(flush, 15000);
setTimeout(showOffline, 0);

// ---------- toast ----------
let tt = null;
export function toast(msg, kind = '') {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = `toast show ${kind}`;
  clearTimeout(tt); tt = setTimeout(() => { el.className = 'toast'; }, kind === 'pr' ? 3500 : 2600);
}
export function celebrate(lines) {
  toast(`New PR! ${lines.join(' · ')}`, 'pr');
  if (navigator.vibrate) navigator.vibrate([30, 40, 60]);
  const c = document.createElement('canvas'); c.className = 'confetti'; c.width = innerWidth; c.height = innerHeight; document.body.append(c);
  const ctx = c.getContext('2d'); const colors = ['#ef4444', '#f59e0b', '#fbbf24', '#4ade80', '#fff'];
  const P = Array.from({ length: 90 }, () => ({ x: innerWidth / 2, y: innerHeight / 3, vx: (Math.random() - 0.5) * 12, vy: Math.random() * -12 - 2, c: colors[Math.floor(Math.random() * 5)], s: 4 + Math.random() * 5 }));
  let t = 0;
  (function tick() {
    ctx.clearRect(0, 0, c.width, c.height);
    for (const p of P) { p.x += p.vx; p.y += p.vy; p.vy += 0.4; ctx.fillStyle = p.c; ctx.fillRect(p.x, p.y, p.s, p.s); }
    if (++t < 90) requestAnimationFrame(tick); else c.remove();
  })();
}

// ---------- sheets ----------
let sheetStack = [];
export function sheet(html, { onMount, onClose } = {}) {
  const root = document.getElementById('sheet-root');
  const bd = document.createElement('div'); bd.className = 'backdrop';
  const el = document.createElement('div'); el.className = 'sheet'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
  el.innerHTML = `<div class="grab"></div>${html}`;
  root.append(bd, el);
  const close = () => { bd.remove(); el.remove(); sheetStack = sheetStack.filter((s) => s !== api2); if (onClose) onClose(); };
  const api2 = { el, close };
  sheetStack.push(api2);
  bd.addEventListener('click', close);
  if (onMount) onMount(el, close);
  const f = el.querySelector('[autofocus]'); if (f) setTimeout(() => f.focus(), 50);
  return api2;
}
export const closeSheets = () => { for (const s of [...sheetStack]) s.close(); };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheetStack.length) sheetStack[sheetStack.length - 1].close(); });
// A menu sheet: items [{ label, sub, danger, group, run }]
// An item can carry info: { title, html } to show an (i) button that explains it without picking it.
export function menu(title, items) {
  const html = `${title ? `<div class="h2" style="margin-bottom:4px">${title}</div>` : ''}<div class="menu">${items.map((it, i) => (it.group ? `<div class="group">${esc(it.group)}</div>` : `<div class="menu-row"><button data-i="${i}" class="${it.danger ? 'danger' : ''}">${it.icon ? icon(it.icon, 20) : ''}<span>${esc(it.label)}</span>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</button>${it.info ? `<button class="info-btn" data-info="${i}" aria-label="What is ${esc(it.label)}?">${icon('info', 20, 2.2)}</button>` : ''}</div>`)).join('')}</div>`;
  return sheet(html, {
    onMount: (el, close) => el.addEventListener('click', (e) => {
      const inf = e.target.closest('button[data-info]');
      if (inf) { const it = items[Number(inf.dataset.info)]; infoSheet(it.info.title, it.info.html); return; }
      const b = e.target.closest('button[data-i]'); if (!b) return;
      const it = items[Number(b.dataset.i)]; close(); if (it.run) it.run();
    }),
  });
}
export function confirmSheet(title, text, { ok = 'OK', danger = false, typeToConfirm = null } = {}) {
  return new Promise((resolve) => {
    let done = false;
    sheet(`<div class="h2">${esc(title)}</div><p class="muted" style="margin:6px 0 12px">${esc(text)}</p>
      ${typeToConfirm ? `<input class="input" id="cf" placeholder="Type ${esc(typeToConfirm)}" autocomplete="off" style="margin-bottom:10px">` : ''}
      <div class="row"><button class="btn grow" data-no>Cancel</button><button class="btn grow ${danger ? 'danger' : 'primary'}" data-ok>${esc(ok)}</button></div>`, {
      onMount: (el, close) => {
        el.querySelector('[data-no]').onclick = () => close();
        el.querySelector('[data-ok]').onclick = () => {
          if (typeToConfirm && el.querySelector('#cf').value.trim() !== typeToConfirm) { toast(`Type ${typeToConfirm} to confirm`); return; }
          done = true; close(); resolve(typeToConfirm ? el.querySelector('#cf').value.trim() : true);
        };
      },
      onClose: () => { if (!done) resolve(false); },
    });
  });
}
export function promptSheet(title, { value = '', placeholder = '', ok = 'Save', multiline = false, extra = '' } = {}) {
  return new Promise((resolve) => {
    let done = false;
    sheet(`<div class="h2" style="margin-bottom:10px">${esc(title)}</div>
      ${multiline ? `<textarea class="input" id="pv" placeholder="${esc(placeholder)}" autofocus>${esc(value)}</textarea>` : `<input class="input" id="pv" value="${esc(value)}" placeholder="${esc(placeholder)}" autofocus>`}
      ${extra}<div class="row" style="margin-top:12px"><button class="btn grow" data-no>Cancel</button><button class="btn primary grow" data-ok>${esc(ok)}</button></div>`, {
      onMount: (el, close) => {
        el.querySelector('[data-no]').onclick = () => close();
        el.querySelector('[data-ok]').onclick = () => { done = true; const extraVals = Object.fromEntries($$('[data-x]', el).map((i) => [i.dataset.x, i.type === 'checkbox' ? i.checked : i.value])); close(); resolve({ value: el.querySelector('#pv').value.trim(), ...extraVals }); };
      },
      onClose: () => { if (!done) resolve(null); },
    });
  });
}

// ---------- formatting ----------
export const MUSCLE_COLORS = { Chest: '#f87171', Back: '#fbbf24', Shoulders: '#fb923c', Biceps: '#a78bfa', Triceps: '#f472b6', Quads: '#60a5fa', Hamstrings: '#4ade80', Glutes: '#2dd4bf', Calves: '#38bdf8', Abs: '#facc15', Traps: '#fdba74', Forearms: '#c4b5fd' };
export const mColor = (m) => MUSCLE_COLORS[m] || '#a1a1aa';
export const PRIORITY = { emphasize: 'Emphasize', grow: 'Grow', maintain: 'Maintain' };
export const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const fmtW = (w) => (w == null ? '' : String(Math.round(w * 100) / 100));
export const fmtDate = (ms, opts = { month: 'short', day: 'numeric' }) => (ms ? new Date(ms).toLocaleDateString(undefined, opts) : '');
export const rirText = (r) => (r == null ? '' : r >= 8 ? 'Deload' : `${r} RIR`);
export const rirHint = (r) => (r == null ? '' : r >= 8 ? 'easy, stop well short of failure' : r === 0 ? 'go to failure, nothing left' : `leave ${r} in the tank`);

// ---------- icons (stroke SVG) ----------
const P = {
  dumbbell: '<path d="M6 6v12M18 6v12M3 9v6M21 9v6M6 12h12"/>',
  calendar: '<rect x="3" y="4" width="18" height="17" rx="3"/><path d="M3 9h18M8 2v4M16 2v4"/>',
  plus: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5M9 8h6"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/>',
  more: '<circle cx="12" cy="5" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="19" r="1.6" fill="currentColor"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  back: '<path d="M15 18l-6-6 6-6"/>',
  right: '<path d="M9 18l6-6-6-6"/>',
  tUp: '<path d="M7 17L17 7M9 7h8v8"/>', tFlat: '<path d="M5 12h14M13 6l6 6-6 6"/>', tDown: '<path d="M7 7l10 10M17 9v8H9"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  note: '<path d="M5 4h14v12l-4 4H5z"/><path d="M9 9h6M9 13h4"/>',
  swap: '<path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>',
  flame: '<path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-7 2 1 3 2 3 4"/>',
  skip: '<path d="M5 5l10 7-10 7zM19 5v14"/>',
  scale: '<path d="M4 20h16M6 20l2-13h8l2 13M12 4v3"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
};
export const icon = (n, s = 18, sw = 2) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ''}</svg>`;

// Simple line chart (SVG) for [{x, y}]
export function lineChart(points, { h = 90, color = 'url(#jhg)' } = {}) {
  if (!points.length) return '<div class="empty">Nothing logged yet</div>';
  const W = 320; const pad = 6;
  const xs = points.map((p) => p.x); const ys = points.map((p) => p.y);
  const x0 = Math.min(...xs); const x1 = Math.max(...xs) || x0 + 1; const y0 = Math.min(...ys); const y1 = Math.max(...ys);
  const sx = (x) => pad + (x1 === x0 ? (W - 2 * pad) / 2 : ((x - x0) / (x1 - x0)) * (W - 2 * pad));
  const sy = (y) => h - pad - (y1 === y0 ? (h - 2 * pad) / 2 : ((y - y0) / (y1 - y0)) * (h - 2 * pad));
  const pts = points.map((p) => `${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  return `<svg class="chart" viewBox="0 0 ${W} ${h}" preserveAspectRatio="none" role="img" aria-label="Chart"><defs><linearGradient id="jhg" x1="0" x2="1"><stop offset="0" stop-color="#ef4444"/><stop offset="1" stop-color="#f59e0b"/></linearGradient></defs>
    <polyline fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${pts}" vector-effect="non-scaling-stroke"/>
    <circle cx="${sx(last.x)}" cy="${sy(last.y)}" r="4.5" fill="#f59e0b"/></svg>`;
}

// Chime when the rest goal is reached (works while the app is open)
let actx = null;
export function chime() {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const t = actx.currentTime;
    [880, 1320].forEach((f, i) => {
      const o = actx.createOscillator(); const g = actx.createGain();
      o.frequency.value = f; o.type = 'sine'; g.gain.setValueAtTime(0.0001, t + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.25, t + i * 0.18 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 0.35);
      o.connect(g).connect(actx.destination); o.start(t + i * 0.18); o.stop(t + i * 0.18 + 0.4);
    });
  } catch { /* no audio */ }
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
}
// iOS needs a user tap before audio can play later
document.addEventListener('pointerdown', () => { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch { /* ignore */ } }, { once: true });

// A short explainer sheet. html is trusted app text.
export function infoSheet(title, html) {
  return sheet(`<div class="eyebrow">What's this?</div><div class="h2">${esc(title)}</div><div class="info-body">${html}</div>
    <button class="btn primary block" style="margin-top:14px" data-ok>Got it</button>`, {
    onMount: (el, close) => { el.querySelector('[data-ok]').onclick = close; },
  });
}
