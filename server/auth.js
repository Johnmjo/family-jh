'use strict';
// Sign-in comes from Cloudflare Access. With CF_ACCESS_TEAM_DOMAIN + CF_ACCESS_AUD set, the signed
// login token is verified on every request; otherwise the email header from Access is trusted.
const { db, nextColor } = require('./db');

const TEAM = (process.env.CF_ACCESS_TEAM_DOMAIN || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
const AUD = process.env.CF_ACCESS_AUD || '';
const DEV_USER = process.env.DEV_USER_EMAIL || '';
const list = (v) => (v || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const ALLOWED = list(process.env.ALLOWED_EMAILS);
const TRUST_HEADER = process.env.TRUST_EMAIL_HEADER === '1'; // opt-out: trust the Access email header without checking the token
const JWT_ON = !!(TEAM && AUD);

let jwks = null;
let jose = null;
async function verifyJwt(token) {
  if (!jose) jose = await import('jose');
  if (!jwks) jwks = jose.createRemoteJWKSet(new URL(`https://${TEAM}/cdn-cgi/access/certs`));
  const { payload } = await jose.jwtVerify(token, jwks, { issuer: `https://${TEAM}`, audience: AUD });
  return payload.email;
}

function nameFromEmail(email) {
  const local = email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\d+/g, '').trim();
  return local ? local.replace(/\b\w/g, (c) => c.toUpperCase()) : email;
}

function allowed(email) {
  if (!ALLOWED.length) return true;
  return ALLOWED.includes(email) || ALLOWED.some((a) => a.startsWith('@') && email.endsWith(a));
}

function ensureMember(email) {
  email = email.trim().toLowerCase();
  const m = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (m) return m;
  if (!allowed(email)) return null;
  const info = db.prepare('INSERT INTO users(email, name, color, created_at) VALUES(?,?,?,?)').run(email, nameFromEmail(email), nextColor(), Date.now());
  return db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
}

async function requireMember(req, res, next) {
  try {
    let email = null;
    if (JWT_ON) {
      const token = req.get('Cf-Access-Jwt-Assertion') || (req.headers.cookie || '').match(/CF_Authorization=([^;]+)/)?.[1];
      if (token) {
        try { email = await verifyJwt(token); } catch { return res.status(403).json({ error: 'Cloudflare Access token is not valid' }); }
      }
    } else if (TRUST_HEADER) {
      email = req.get('Cf-Access-Authenticated-User-Email') || null;
    } else if (!DEV_USER) {
      // Without the token check anyone on the home network could fake the email header, so refuse to run open.
      if (req.path.startsWith('/api/')) return res.status(503).json({ error: 'Sign-in is not set up: set CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD' });
      return res.status(503).type('html').send(`<!doctype html><meta name=viewport content="width=device-width"><body style="font-family:system-ui;padding:40px;max-width:560px;margin:auto">
<h2>Jones Hypertrophy</h2><p>Sign-in is not set up yet. Set <code>CF_ACCESS_TEAM_DOMAIN</code> and <code>CF_ACCESS_AUD</code> on the container
(the same values as the family calendar) so the app can check Cloudflare Access logins.</p></body>`);
    }
    // Local testing only, and never when the token check is on
    if (!email && DEV_USER && !JWT_ON) email = req.get('X-Dev-User') || DEV_USER;
    if (!email) {
      if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Not signed in' });
      return res.status(401).type('html').send(`<!doctype html><meta name=viewport content="width=device-width"><body style="font-family:system-ui;padding:40px;max-width:560px;margin:auto">
<h2>Jones Hypertrophy</h2><p>This app expects to sit behind Cloudflare Access, which signs people in.
No signed-in user was found on this request.</p><p>If you are testing locally, set <code>DEV_USER_EMAIL</code>.</p></body>`);
    }
    const member = ensureMember(email);
    if (!member) return res.status(403).json({ error: 'This email is not on the family list' });
    req.member = member;
    next();
  } catch (e) { next(e); }
}

module.exports = { requireMember, ensureMember, jwtEnabled: JWT_ON, mode: JWT_ON ? 'token' : TRUST_HEADER ? 'header' : DEV_USER ? 'dev' : 'off' };
