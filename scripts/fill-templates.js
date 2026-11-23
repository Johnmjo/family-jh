// Fills the built-in templates that have no exercises with recommended picks.
// Run: node scripts/fill-templates.js   (rewrites data/templates.json; templates that already
// have exercises are left alone). Each slot gets the muscle's primary list for its first slot in
// a day and the secondary list after that, rotating by day so the days differ, never repeating an
// exercise within a day.
'use strict';
const fs = require('fs');
const path = require('path');

const PICKS = {
  Chest: {
    primary: ['Bench Press (Medium Grip)', 'Dumbbell Press (Low Incline)', 'Machine Chest Press', 'Smith Machine Press (Incline, Medium Grip)', 'Dumbbell Press (Flat)', 'Bench Press (Incline, Medium Grip)'],
    secondary: ['Cable Flye', 'Pec Dec Flye', 'Dumbbell Press Flye (Incline)', 'Machine Chest Press (Incline)', 'Cable Flye (High)', 'Dip (Chest-Focused)'],
  },
  Back: {
    primary: ['Pulldown (Normal Grip)', 'Machine Chest Supported Row', 'Pulldown (Parallel Grip)', 'Barbell Bent Over Row', 'Assisted Pullup (Normal Grip)', 'Dumbbell Row (Single-Arm, Supported)'],
    secondary: ['Seated Cable Row', 'Pulldown (Underhand Grip)', 'Chest Supported Row', 'Pulldown (Straight Arm)', 'Hammer Machine Row (Low)', 'Pulldown (Single-Arm)'],
  },
  Shoulders: {
    primary: ['Dumbbell Lateral Raise', 'Cable Lateral Raise (Single-Arm)', 'Machine Lateral Raise', 'Dumbbell Lateral Raise (Seated)', 'Cable Leaning Lateral Raise'],
    secondary: ['Machine Shoulder Press', 'Cable Rope Facepull', 'Dumbbell Shoulder Press (Seated)', 'Machine Reverse Flye', 'Cable Upright Row'],
  },
  Triceps: {
    primary: ['Cable Triceps Pushdown (Rope)', 'Cable Overhead Triceps Extension (Rope)', 'EZ Bar Skullcrusher', 'Dip Machine', 'JM Press'],
    secondary: ['Cable Overhead Triceps Extension', 'Machine Triceps Extension', 'Cable Triceps Pushdown (Bar)', 'Dumbbell Overhead Extension', 'Cable Triceps Pushdown (Single-Arm)'],
  },
  Biceps: {
    primary: ['EZ Bar Curl (Normal Grip)', 'Dumbbell Curl (Incline)', 'Cable Curl', 'Machine Preacher Curl', 'Barbell Curl (Normal Grip)'],
    secondary: ['Hammer Curl', 'Bayesian Curl', 'Dumbbell Spider Curl', 'Cable Hammer Curl (Rope)', 'EZ Bar Preacher Curl'],
  },
  Quads: {
    primary: ['Hack Squat', 'Barbell Squat (High Bar)', 'Leg Press', 'Pendulum Squat', 'Smith Machine Squat (Feet Forward)'],
    secondary: ['Leg Extension', 'Bulgarian Split Squat (Quad-Focused)', 'Single Leg Extension', 'Walking Lunges (Quad-Focused, Dumbbell)', 'Leg Press'],
  },
  Hamstrings: {
    primary: ['Seated Leg Curl', 'Stiff-Legged Deadlift', 'Lying Leg Curl', 'Dumbbell Stiff Legged Deadlift'],
    secondary: ['Lying Leg Curl', 'Back Raise (45 degree)', 'Seated Leg Curl', 'Single-Leg Leg Curl'],
  },
  Glutes: {
    primary: ['Barbell Hip Thrust', 'Machine Hip Thrust', 'Bulgarian Split Squat (Glute-Focused)', 'Deadlift (Sumo Stance)'],
    secondary: ['Hip Abduction Machine', 'Cable Kickback', 'Walking Lunges (Glute-Focused, Dumbbell)', 'Machine Glute Kickback'],
  },
  Calves: { primary: ['Standing Calf Raise', 'Leg Press Calves', 'Calf Machine', 'Smith Machine Calves'], secondary: ['Leg Press Calves', 'Calf Machine', 'Standing Calf Raise'] },
  Abs: { primary: ['Cable Rope Crunch', 'Hanging Knee Raise', 'Machine Crunch', 'Ab Wheel'], secondary: ['Hanging Straight Leg Raise', 'Reaching Sit-Up', 'Cable Rope Crunch'] },
  Traps: { primary: ['Machine Shrug', 'Smith Machine Shrug'], secondary: ['Smith Machine Shrug', 'Machine Shrug'] },
  Forearms: { primary: ['Dumbbell Bench Wrist Curl', 'Reverse Curl', 'Cable Wrist Curl'], secondary: ['Reverse Curl', 'Cable Wrist Curl', 'Dumbbell Standing Wrist Curl'] },
};

const file = path.join(__dirname, '..', 'data', 'templates.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const lib = new Map(fs.readFileSync(path.join(__dirname, '..', 'data', 'exercises.csv'), 'utf8').trim().split('\n').slice(1)
  .map((l) => { const [name, muscle] = l.match(/("([^"]|"")*"|[^,]*)/g).filter((_, i) => i % 2 === 0).map((c) => c.replace(/^"|"$/g, '').replace(/""/g, '"')); return [name, muscle]; }));
for (const [m, p] of Object.entries(PICKS)) for (const n of [...p.primary, ...p.secondary]) {
  if (lib.get(n) !== m) throw new Error(`${n} is not a ${m} exercise in the library`);
}

let filled = 0; let templates = 0;
for (const t of data.templates) {
  if (t.days.some((d) => d.slots.some((s) => s.exercise))) continue; // already has exercises
  t.days.forEach((d, di) => {
    const used = new Set();
    const seen = {};
    for (const s of d.slots) {
      const p = PICKS[s.muscle]; if (!p) continue;
      const k = seen[s.muscle] = (seen[s.muscle] || 0) + 1;
      const list = k === 1 ? p.primary : p.secondary;
      const start = (di + (k > 2 ? k : 0)) % list.length;
      let pick = null;
      for (let i = 0; i < list.length && !pick; i++) { const n = list[(start + i) % list.length]; if (!used.has(n)) pick = n; }
      if (!pick) pick = [...p.primary, ...p.secondary].find((n) => !used.has(n));
      if (!pick) continue;
      used.add(pick); s.exercise = pick; s.suggested = true; filled++;
    }
  });
  t.exercisesPrefilled = true; templates++;
}
fs.writeFileSync(file, JSON.stringify(data, null, 1) + '\n');
console.log(`filled ${filled} slots in ${templates} templates`);
