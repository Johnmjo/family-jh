'use strict';
const fs = require('fs');
const path = require('path');
const express = require('express');
const { db } = require('./db');
const auth = require('./auth');
const store = require('./store');
const rpimport = require('./rpimport');

const PORT = Number(process.env.PORT || 8086);
const HUB_URL = process.env.HUB_URL ?? 'https://johnjonesfam.com/';
// Optional prefix such as /jh (the hub serves every app under one address). The app also keeps
// answering at the root on the same port, so LAN access by IP keeps working.
const BASE = `/${(process.env.BASE_PATH || '').trim().replace(/^\/+|\/+$/g, '')}`.replace(/^\/$/, '');
const r = express.Router();
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

r.get('/healthz', (req, res) => res.json({ ok: true }));

const PUB = path.join(__dirname, '..', 'public');
// The math module is shared with the browser
r.get(['/js/engine.js', '/v/:ver/js/engine.js'], (req, res) => res.set('Cache-Control', 'no-cache').type('js').sendFile(path.join(__dirname, 'engine.js')));
r.get('/index.html', (req, res) => res.redirect(302, `${req.baseUrl}/`));
// Every deploy gets new asset URLs (/v/<hash>/...), so phones and Cloudflare's cache can't keep an old app
const ASSET_VER = (() => {
  const hash = require('crypto').createHash('sha1');
  const walk = (d) => { for (const f of fs.readdirSync(d).sort()) { const q = path.join(d, f); if (fs.statSync(q).isDirectory()) walk(q); else hash.update(f).update(fs.readFileSync(q)); } };
  walk(PUB);
  hash.update(fs.readFileSync(path.join(__dirname, 'engine.js')));
  return hash.digest('hex').slice(0, 10);
})();
r.use('/v/:ver', (req, res, next) => { res.locals.current = req.params.ver === ASSET_VER; next(); },
  express.static(PUB, { index: false, setHeaders: (res) => res.set('Cache-Control', res.locals.current ? 'public, max-age=31536000, immutable' : 'no-cache') }));
r.use(express.static(PUB, { index: false, maxAge: '1h', setHeaders: (res, p) => { if (/\.js$|\.css$/.test(p)) res.set('Cache-Control', 'no-cache'); } }));

r.use(auth.requireMember);
// Changes must be JSON from this site, so another web page can't submit to the API
r.use('/api', (req, res, next) => {
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  const origin = req.get('Origin');
  if (origin) {
    let host = null;
    try { host = new URL(origin).host; } catch { /* "null" or junk */ }
    const hosts = [req.get('host'), req.get('X-Forwarded-Host')].filter(Boolean);
    if (!host || !hosts.includes(host)) return res.status(403).json({ error: 'Cross-site request blocked' });
  }
  if (req.method !== 'DELETE' && !req.is('application/json')) return res.status(415).json({ error: 'Send JSON' });
  next();
});
const smallJson = express.json({ limit: '5mb' });
const bigJson = express.json({ limit: '60mb' }); // RP history imports
r.use((req, res, next) => (req.path.startsWith('/api/import/') ? bigJson : smallJson)(req, res, next));

const INDEX = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8').replaceAll('__V__', `v/${ASSET_VER}/`);
const page = (req, res) => res.set('Cache-Control', 'no-cache').type('html').send(INDEX.replace('__BASE__', `${req.baseUrl}/`).replace('__HUB__', HUB_URL));
// Deep links load the app shell; the app reads the path
r.get(['/', '/workout/:id', '/meso', '/meso/:id', '/new', '/new/*rest', '/progress', '/exercises', '/exercise/:id', '/settings', '/mesos', '/summary/:id'], page);

// Writes may carry an X-Op-Id so a retry from a phone that lost signal is only applied once
const opSeen = db.prepare('SELECT 1 FROM ops WHERE id=? AND user_id=?');
const opAdd = db.prepare('INSERT OR IGNORE INTO ops(id,user_id,at) VALUES(?,?,?)');
setInterval(() => db.prepare('DELETE FROM ops WHERE at < ?').run(Date.now() - 14 * 864e5), 6 * 3600e3).unref();
const wrap = (fn) => (req, res) => {
  try {
    const op = req.get('X-Op-Id');
    if (op && req.method !== 'GET' && opSeen.get(op, req.member.id)) return res.json({ ok: true, replay: true });
    const out = db.transaction(() => {
      const o = fn(req, res);
      if (op && req.method !== 'GET') opAdd.run(String(op).slice(0, 80), req.member.id, Date.now());
      return o;
    })();
    if (res.headersSent) return;
    res.set('Cache-Control', 'no-store').json(req.method === 'GET' ? out : { ok: true, ...(out || {}) });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: 'Something went wrong' });
  }
};
const me = (req) => db.prepare('SELECT * FROM users WHERE id=?').get(req.member.id);

r.get('/api/home', wrap((req) => ({ ...store.home(me(req)), hubUrl: HUB_URL, muscles: store.MUSCLES, equipment: store.EQUIPMENT, families: store.FAMILIES })));
r.get('/api/settings', wrap((req) => store.settingsOf(me(req))));
r.put('/api/settings', wrap((req) => ({ settings: store.updateSettings(me(req), req.body) })));

r.get('/api/exercises', wrap((req) => store.listExercises(me(req))));
r.post('/api/exercises', wrap((req) => ({ id: store.createExercise(me(req), req.body) })));
r.get('/api/exercises/:id', wrap((req) => store.exerciseDetail(me(req), Number(req.params.id))));
r.put('/api/exercises/:id', wrap((req) => { store.updateExercise(me(req), Number(req.params.id), req.body); }));
r.delete('/api/exercises/:id', wrap((req) => { store.deleteExercise(me(req), Number(req.params.id)); }));
r.get('/api/exercises/:id/similar', wrap((req) => store.similarFor(me(req), Number(req.params.id))));
r.get('/api/exercises/:id/suggest', wrap((req) => store.suggestFor(me(req), store.exercise(me(req), Number(req.params.id)), { rir: Number(req.query.rir ?? 2) })));
r.get('/api/exercises/:id/max', wrap((req) => store.expectedMax(me(req), Number(req.params.id))));
r.get('/api/exercises/:id/ramp', wrap((req) => store.rampPreview(me(req), Number(req.params.id), req.query.expected, req.query.optional !== '0')));
r.post('/api/exercises/:id/notes', wrap((req) => { store.addExerciseNote(me(req), Number(req.params.id), req.body); }));
r.delete('/api/notes/:id', wrap((req) => { store.deleteNote(me(req), Number(req.params.id)); }));
r.put('/api/notes/:id', wrap((req) => { store.pinNote(me(req), Number(req.params.id), !!req.body.pinned); }));

r.get('/api/mesos', wrap((req) => store.mesoList(me(req))));
r.post('/api/mesos', wrap((req) => ({ id: store.createMeso(me(req), req.body) })));
r.get('/api/mesos/:id', wrap((req) => store.mesoView(me(req), Number(req.params.id))));
r.get('/api/mesos/:id/summary', wrap((req) => store.mesoSummary(me(req), Number(req.params.id))));
r.get('/api/mesos/:id/copy', wrap((req) => store.copyPreview(me(req), Number(req.params.id), req.query.week)));
r.post('/api/mesos/:id/action', wrap((req) => store.mesoAction(me(req), Number(req.params.id), req.body)));

r.get('/api/templates', wrap((req) => store.templateList(me(req))));
r.get('/api/templates/:id', wrap((req) => store.templateDetail(me(req), req.params.id)));
r.delete('/api/templates/:id', wrap((req) => { store.deleteTemplate(me(req), req.params.id); }));
r.post('/api/autofill', wrap((req) => ({ slots: store.autofill(me(req), req.body.slots || [], req.body.taken || []) })));

r.get('/api/workouts/:id', wrap((req) => store.workoutView(me(req), Number(req.params.id))));
r.post('/api/workouts/:id/action', wrap((req) => store.workoutAction(me(req), Number(req.params.id), req.body)));
r.post('/api/workouts/:id/exercises', wrap((req) => store.addExerciseToWorkout(me(req), Number(req.params.id), req.body)));
r.post('/api/workouts/:id/checkin', wrap((req) => { store.checkin(me(req), Number(req.params.id), req.body); }));
r.post('/api/checkins/:id/soreness', wrap((req) => { store.soreness(me(req), Number(req.params.id), req.body.value); }));
r.put('/api/sets/:id', wrap((req) => store.updateSet(me(req), Number(req.params.id), req.body)));
r.post('/api/sets/:id/action', wrap((req) => store.setAction(me(req), Number(req.params.id), req.body)));
r.post('/api/wex/:id/action', wrap((req) => store.wexAction(me(req), Number(req.params.id), req.body)));

r.get('/api/progress', wrap((req) => store.progress(me(req))));
r.post('/api/bodyweight', wrap((req) => { store.addBodyweight(me(req), req.body); }));
r.get('/api/export', (req, res) => {
  const data = store.exportAll(me(req));
  res.set('Content-Disposition', `attachment; filename="jh-export-${new Date().toISOString().slice(0, 10)}.json"`).json(data);
});
r.post('/api/import/rp/preview', wrap((req) => ({ preview: rpimport.preview(me(req), req.body && req.body.data) })));
r.post('/api/import/rp', wrap((req) => ({ result: rpimport.run(me(req), req.body && req.body.data, { continue: req.body && req.body.continue }) })));
r.post('/api/delete-my-data', wrap((req) => { store.deleteAll(me(req), req.body.confirm); }));

r.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
r.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Bad request' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'That file is too big' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

if (BASE) {
  app.use((req, res, next) => (req.path === BASE ? res.redirect(301, `${BASE}/${req.url.slice(req.path.length)}`) : next()));
  app.use(BASE, r);
}
app.use(r);

function start() {
  const how = { token: 'Cloudflare Access token check on', header: 'WARNING: trusting the email header without a token check', dev: `DEV MODE: every request is ${process.env.DEV_USER_EMAIL}`, off: 'sign-in NOT set up: set CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD' }[auth.mode];
  const server = app.listen(PORT, () => console.log(`Jones Hypertrophy listening on :${PORT}${BASE ? ` at / and ${BASE}/` : ''} (${how})`));
  const stop = () => { server.close(() => { db.close(); process.exit(0); }); setTimeout(() => process.exit(0), 3000).unref(); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  return server;
}

module.exports = { app, start, BASE };
if (require.main === module) start();
