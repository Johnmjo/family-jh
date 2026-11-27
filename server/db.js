'use strict';
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const H = require('./howto');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data-local');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, process.env.DB_FILE || 'jh.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

// Same family palette as the other apps, so each person keeps "their" color
const PALETTE = ['#039be5', '#7986cb', '#33b679', '#8e24aa', '#e67c73', '#f6bf26', '#f4511e', '#0b8043', '#3f51b5', '#d50000', '#616161', '#ad1457'];

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  settings TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
-- Built-in exercises have owner_id NULL; custom ones belong to one person
CREATE TABLE IF NOT EXISTS exercises (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  muscle TEXT NOT NULL,
  equipment TEXT NOT NULL,
  family TEXT,
  ratio REAL,
  howto TEXT,             -- JSON for custom exercises; built-ins come from howto.js
  link TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS exercises_builtin ON exercises(name) WHERE owner_id IS NULL;
CREATE TABLE IF NOT EXISTS mesos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  weeks INTEGER NOT NULL,
  deload INTEGER NOT NULL DEFAULT 1,
  rirs TEXT NOT NULL,                -- JSON list, one per week
  priorities TEXT NOT NULL DEFAULT '{}',
  is_current INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',   -- active | finished
  source TEXT,
  created_at INTEGER NOT NULL,
  finished_at INTEGER
);
CREATE TABLE IF NOT EXISTS meso_days (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meso_id INTEGER NOT NULL REFERENCES mesos(id) ON DELETE CASCADE,
  pos INTEGER NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  weekday INTEGER                 -- 0 Sun .. 6 Sat, optional
);
CREATE TABLE IF NOT EXISTS workouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meso_id INTEGER NOT NULL REFERENCES mesos(id) ON DELETE CASCADE,
  day_id INTEGER NOT NULL REFERENCES meso_days(id) ON DELETE CASCADE,
  week INTEGER NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | done | skipped
  generated INTEGER NOT NULL DEFAULT 0,
  bodyweight REAL,
  started_at INTEGER,
  finished_at INTEGER,
  UNIQUE (meso_id, day_id, week)
);
-- One exercise inside one workout
CREATE TABLE IF NOT EXISTS wex (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workout_id INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  pos INTEGER NOT NULL,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id),
  muscle TEXT NOT NULL,
  orig_exercise_id INTEGER,        -- set when swapped for this day only
  start_sets INTEGER NOT NULL DEFAULT 2,
  rest_goal INTEGER,               -- seconds; NULL = your default
  joint_pain TEXT,                 -- null | some | painful
  why TEXT,                        -- reason for the set count this week
  suggestion TEXT,                 -- JSON: how week 1 weight was picked
  plan_1rm INTEGER NOT NULL DEFAULT 0,
  removed INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wex_id INTEGER NOT NULL REFERENCES wex(id) ON DELETE CASCADE,
  pos INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'regular',   -- regular | myo | myomatch | warmup | attempt
  target_weight REAL,
  target_reps INTEGER,
  range_low REAL,
  range_high REAL,
  weight REAL,
  reps INTEGER,
  done INTEGER NOT NULL DEFAULT 0,
  skipped INTEGER NOT NULL DEFAULT 0,
  logged_at INTEGER,
  result TEXT,                     -- made | missed (1RM attempts)
  pct INTEGER,                     -- % of expected max (1RM ramp)
  rest INTEGER                     -- suggested rest before the next set, seconds
);
CREATE TABLE IF NOT EXISTS checkins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workout_id INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  muscle TEXT NOT NULL,
  pump TEXT, workload TEXT, joints TEXT,
  soreness TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE (workout_id, muscle)
);
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL,             -- meso | workout | exercise
  ref_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS bodyweights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weight REAL NOT NULL,
  at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  focus TEXT NOT NULL DEFAULT '',
  days TEXT NOT NULL,
  priorities TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
-- Offline-safe writes: each change from the phone carries an id, so a retry is applied once
CREATE TABLE IF NOT EXISTS ops (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS wex_ex ON wex(exercise_id);
CREATE INDEX IF NOT EXISTS sets_wex ON sets(wex_id);
CREATE INDEX IF NOT EXISTS workouts_meso ON workouts(meso_id, week);
CREATE INDEX IF NOT EXISTS mesos_user ON mesos(user_id);
CREATE INDEX IF NOT EXISTS notes_ref ON notes(user_id, scope, ref_id);
`);

// ---------- columns added after launch ----------
const hasCol = (table, col) => db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);
// today's joint pain answer for one exercise (none | low | moderate | severe), asked once its sets are done
if (!hasCol('wex', 'joint_answer')) db.exec('ALTER TABLE wex ADD COLUMN joint_answer TEXT');

// ---------- built-in exercise library (from data/exercises.csv) ----------
function parseCsvLine(l) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < l.length; i++) {
    const c = l[i];
    if (c === '"') { if (q && l[i + 1] === '"') { cur += '"'; i++; } else q = !q; } else if (c === ',' && !q) { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out;
}
function loadLibrary() {
  const file = path.join(__dirname, '..', 'data', 'exercises.csv');
  const lines = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/).slice(1);
  const rows = lines.map(parseCsvLine).filter((r) => r[0]);
  const byName = new Map(rows.map((r) => [r[0], r]));
  const up = db.prepare(`INSERT INTO exercises(owner_id, name, muscle, equipment, family, ratio, created_at) VALUES(NULL,?,?,?,?,?,?)
    ON CONFLICT(name) WHERE owner_id IS NULL DO UPDATE SET muscle=excluded.muscle, equipment=excluded.equipment, family=excluded.family, ratio=excluded.ratio`);
  db.transaction(() => {
    for (const [name, muscle, equipment] of rows) {
      const f = H.familyOf(name);
      const mainEq = f && byName.get(f.main) ? byName.get(f.main)[2] : equipment;
      up.run(name, muscle, equipment, f ? f.id : null, f ? H.ratioFor(name, equipment, mainEq) : null, Date.now());
    }
  })();
  return rows.length;
}
loadLibrary();

function nextColor() {
  const used = db.prepare('SELECT color FROM users').all().map((r) => r.color);
  return PALETTE.find((c) => !used.includes(c)) || PALETTE[used.length % PALETTE.length];
}

module.exports = { db, PALETTE, nextColor, DATA_DIR, parseCsvLine };
