import { api, icon, esc, toast, closeSheets, flush } from './ui.js';

// ---------- shared state ----------
export const ctx = { home: null, settings: null, muscles: [], equipment: [], families: [], exercises: null };
export async function loadHome() {
  const h = await api.get('home');
  ctx.home = h; ctx.settings = h.settings; ctx.muscles = h.muscles; ctx.equipment = h.equipment; ctx.families = h.families;
  document.documentElement.dataset.theme = h.settings.theme || 'dark';
  return h;
}
export async function exercises(force = false) {
  if (!ctx.exercises || force) ctx.exercises = await api.get('exercises');
  return ctx.exercises;
}

// ---------- router ----------
const base = new URL(document.baseURI).pathname; // e.g. /jh/
const routes = [
  [/^$/, () => import('./today.js').then((m) => m.today())],
  [/^workout\/(\d+)$/, (id) => import('./today.js').then((m) => m.workout(Number(id)))],
  [/^meso$/, () => import('./meso.js').then((m) => m.meso())],
  [/^meso\/(\d+)$/, (id) => import('./meso.js').then((m) => m.meso(Number(id)))],
  [/^mesos$/, () => import('./meso.js').then((m) => m.mesos())],
  [/^summary\/(\d+)$/, (id) => import('./meso.js').then((m) => m.summary(Number(id)))],
  [/^new$/, () => import('./newmeso.js').then((m) => m.start())],
  [/^new\/copy(?:\/(\d+))?$/, (id) => import('./newmeso.js').then((m) => m.copy(id ? Number(id) : null))],
  [/^new\/template$/, () => import('./newmeso.js').then((m) => m.templates())],
  [/^new\/build$/, () => import('./newmeso.js').then((m) => m.build())],
  [/^progress$/, () => import('./progress.js').then((m) => m.progress())],
  [/^exercises$/, () => import('./exercises.js').then((m) => m.library())],
  [/^exercise\/(\d+)$/, (id) => import('./exercises.js').then((m) => m.detail(Number(id)))],
  [/^settings$/, () => import('./settings.js').then((m) => m.settings())],
];
export function path() {
  let p = location.pathname;
  if (p.startsWith(base)) p = p.slice(base.length); else p = p.replace(/^\//, '');
  return p.replace(/\/$/, '');
}
export function go(to, { replace = false } = {}) {
  const url = base + to.replace(/^\//, '');
  if (replace) history.replaceState({}, '', url); else history.pushState({}, '', url);
  render();
}
export const query = () => new URLSearchParams(location.search);
let renderSeq = 0;
export const seq = () => renderSeq;
export async function render() {
  const my = ++renderSeq;
  closeSheets();
  if (window.__jhTimer) { clearInterval(window.__jhTimer); window.__jhTimer = null; }
  const p = path();
  tabs(p);
  document.getElementById('bar-actions').innerHTML = `<a class="bar-btn" href="meso" data-link aria-label="Meso calendar">${icon('calendar', 20)}</a><a class="bar-btn" href="settings" data-link aria-label="Profile and settings">${icon('user', 20)}</a>`;
  for (const [re, fn] of routes) {
    const m = p.match(re);
    if (m) {
      try { await fn(...m.slice(1)); } catch (e) {
        if (my !== renderSeq) return;
        console.error(e);
        document.getElementById('app').innerHTML = `<div class="card" style="margin-top:20px"><div class="h2">Couldn't load this</div><p class="muted">${esc(e.message)}</p><button class="btn primary" onclick="location.reload()">Try again</button></div>`;
      }
      if (my === renderSeq) window.scrollTo(0, window.__jhKeepScroll ? window.scrollY : 0);
      window.__jhKeepScroll = false;
      return;
    }
  }
  go('', { replace: true });
}
function tabs(p) {
  const on = (k) => (k === 'today' ? p === '' || p.startsWith('workout') : k === 'meso' ? p.startsWith('meso') || p.startsWith('summary') : p.startsWith(k));
  const t = [['today', '', 'dumbbell', 'Today'], ['meso', 'meso', 'calendar', 'Meso'], ['new', 'new', 'plus', 'New'], ['progress', 'progress', 'chart', 'Progress'], ['exercise', 'exercises', 'book', 'Exercises']];
  document.getElementById('tabs').innerHTML = t.map(([k, href, ic, label]) => `<a href="${href || './'}" data-link class="${on(k) ? 'on' : ''}">${icon(ic, 22)}${label}</a>`).join('');
}
// in-app links
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-link]');
  if (!a || e.metaKey || e.ctrlKey) return;
  e.preventDefault();
  const href = a.getAttribute('href');
  go(href === './' ? '' : href);
});
window.addEventListener('popstate', render);

(async function boot() {
  try { await loadHome(); } catch (e) {
    document.getElementById('app').innerHTML = `<div class="card" style="margin-top:20px"><div class="h2">Couldn't reach Jones Hypertrophy</div><p class="muted">${esc(e.message)}</p><button class="btn primary" onclick="location.reload()">Try again</button></div>`;
    return;
  }
  flush();
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
export { toast };
