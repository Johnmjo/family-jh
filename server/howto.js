'use strict';
// Our own written how-to for every built-in exercise, plus the "families" of close variations used
// for similar-exercise suggestions. Each family has a base how-to; the words in an exercise's name
// (Incline, Wide Grip, Single-Arm, Seated...) add their own setup notes and cues, so every one of the
// 299 exercises gets a page that fits it. Edit freely: this file is the single place for this text.
//
// ratio: rough difficulty against the family's main lift, as effective load (for dumbbells, the
// weight of ONE dumbbell). These are rules of thumb and are shown as "rough guess" in the app.

const F = [];
const fam = (o) => F.push(o);

// ---------------- CHEST ----------------
fam({
  id: 'bench', label: 'Barbell bench press', main: 'Bench Press (Medium Grip)',
  test: (n) => /^Bench Press/.test(n) && !/Close Grip/.test(n),
  muscles: ['Chest', 'Triceps', 'Front delts'],
  setup: ['Lie back with your eyes under the bar and your feet flat on the floor.', 'Pull your shoulder blades back and down and keep a slight arch in your upper back.', 'Grip the bar with your wrists stacked over your elbows.'],
  steps: ['Unrack and hold the bar over your shoulders with straight arms.', 'Lower it under control to your mid chest, elbows about 45 degrees from your body.', 'Press up and slightly back until your arms are straight again.'],
  cues: ['Squeeze the bar and push your feet into the floor.', 'Keep your butt and shoulders on the bench the whole set.'],
  mistakes: ['Bouncing the bar off your chest.', 'Letting your shoulders roll forward at the top.', 'Flaring your elbows straight out to the sides.'],
});
fam({
  id: 'smith_press', label: 'Smith machine press', main: 'Smith Machine Bench Press (Medium Grip)',
  test: (n) => /^Smith Machine (Bench )?Press/.test(n),
  muscles: ['Chest', 'Triceps', 'Front delts'],
  setup: ['Set the bench so the bar comes down to your mid or upper chest.', 'Set the safety stops just below your chest.', 'Pull your shoulder blades back and plant your feet.'],
  steps: ['Twist the bar off the hooks.', 'Lower it under control until it lightly touches your chest.', 'Press straight up along the track until your arms are straight.'],
  cues: ['Because the track is fixed, bench position decides where the bar lands. Check it with an empty bar first.', 'Keep a steady tempo on the way down.'],
  mistakes: ['Setting the bench so the bar lands on your neck or belly.', 'Forgetting the safety stops.'],
});
fam({
  id: 'db_press', label: 'Dumbbell press', main: 'Dumbbell Press (Flat)',
  test: (n) => /^Dumbbell Press(?! Flye)/.test(n) && !/High Incline/.test(n),
  muscles: ['Chest', 'Triceps', 'Front delts'],
  setup: ['Sit on the end of the bench with the dumbbells on your thighs.', 'Lie back and use your knees to help kick the weights up to your chest.', 'Pull your shoulder blades back and down.'],
  steps: ['Press the dumbbells up over your chest until your arms are straight.', 'Lower them slowly and deep, until you feel a good stretch in your chest.', 'Press back up, bringing the dumbbells slightly together at the top.'],
  cues: ['Forearms stay vertical under the dumbbells.', 'Go deeper than you could with a bar.'],
  mistakes: ['Cutting the bottom short.', 'Clanging the dumbbells together at the top and losing tension.'],
});
fam({
  id: 'db_flye', label: 'Dumbbell flye', main: 'Dumbbell Flye (Flat)',
  test: (n) => /^Dumbbell (Flye|Press Flye)/.test(n),
  muscles: ['Chest', 'Front delts'],
  setup: ['Lie on the bench holding the dumbbells over your chest, palms facing each other.', 'Keep a soft, fixed bend in your elbows.'],
  steps: ['Open your arms wide in an arc until you feel a deep stretch across your chest.', 'Hug the weights back up along the same arc.', 'Stop just before the dumbbells touch.'],
  cues: ['Think of hugging a big tree.', 'The elbow angle does not change during the rep.'],
  mistakes: ['Turning it into a press by bending the elbows more and more.', 'Going so heavy you cannot control the stretch.'],
});
fam({
  id: 'cable_flye', label: 'Cable flye', main: 'Cable Flye',
  test: (n) => /^Cable Flye/.test(n),
  muscles: ['Chest', 'Front delts'],
  setup: ['Set both pulleys at the height the variation calls for and grab a handle in each hand.', 'Take a step forward so the cables pull your arms back into a stretch.', 'Stagger your feet for balance.'],
  steps: ['With a soft bend in your elbows, bring your hands together in front of your chest.', 'Squeeze for a moment.', 'Let your arms open slowly until you feel the stretch again.'],
  cues: ['Lead with your hands, not your elbows.', 'Keep your chest up and shoulders down.'],
  mistakes: ['Leaning far forward and pressing instead of flying.', 'Letting the weight stack touch down between reps.'],
});
fam({
  id: 'machine_flye', label: 'Machine flye', main: 'Pec Dec Flye',
  test: (n) => /^(Machine Flye|Pec Dec Flye)$/.test(n),
  muscles: ['Chest'],
  setup: ['Set the seat so the handles line up with the middle of your chest.', 'Set the arms so you start in a stretch but not a painful one.', 'Sit tall with your back against the pad.'],
  steps: ['Bring the handles together in front of you in a wide arc.', 'Squeeze for a moment.', 'Let them open slowly back to the stretch.'],
  cues: ['Keep your shoulders back against the pad.', 'Slow on the way back.'],
  mistakes: ['Seat too high, which turns it into a shoulder exercise.', 'Using momentum to slam the handles together.'],
});
fam({
  id: 'machine_chest', label: 'Machine chest press', main: 'Machine Chest Press',
  test: (n) => /Chest Press/.test(n),
  muscles: ['Chest', 'Triceps', 'Front delts'],
  setup: ['Set the seat so the handles line up with your mid chest.', 'Sit with your back flat on the pad and shoulder blades pulled back.'],
  steps: ['Press the handles forward until your arms are almost straight.', 'Let them come back slowly until you feel a stretch in your chest.', 'Press again without resting at the back.'],
  cues: ['Keep your shoulders down and back.', 'Control the stretch at the back of each rep.'],
  mistakes: ['Shrugging up as you press.', 'Letting the weight stack crash down.'],
});
fam({
  id: 'pushup', label: 'Pushup', main: 'Pushup',
  test: (n) => /^Pushup/.test(n),
  muscles: ['Chest', 'Triceps', 'Front delts', 'Abs'],
  setup: ['Hands on the floor a little wider than your shoulders.', 'Body in a straight line from head to heels, abs tight.'],
  steps: ['Lower your chest to just above the floor, elbows about 45 degrees out.', 'Push the floor away until your arms are straight.'],
  cues: ['Squeeze your glutes so your hips do not sag.', 'Chest touches before your hips do.'],
  mistakes: ['Hips sagging or piking up.', 'Half reps.'],
});
fam({
  id: 'dip', label: 'Dip', main: 'Dip (Chest-Focused)',
  test: (n) => /^(Dip|Assisted Dip|Dip Machine)/.test(n),
  muscles: ['Chest', 'Triceps', 'Front delts'],
  setup: ['Grip the bars and support yourself with straight arms.'],
  steps: ['Lower yourself by bending your elbows until your shoulders are a little below your elbows.', 'Press back up to straight arms.'],
  cues: ['Keep your shoulders away from your ears.', 'Control the bottom; do not drop into it.'],
  mistakes: ['Going so deep your shoulders hurt.', 'Kicking your legs to get up.'],
});

// ---------------- BACK ----------------
fam({
  id: 'pulldown', label: 'Pulldown', main: 'Pulldown (Normal Grip)',
  test: (n) => /^(Pulldown|Machine Pulldown)/.test(n) && !/Straight Arm/.test(n),
  muscles: ['Lats', 'Upper back', 'Biceps'],
  setup: ['Set the thigh pad so your legs are locked in.', 'Grab the bar or handles with the grip the variation calls for.', 'Sit down with your arms straight and stretched overhead.'],
  steps: ['Pull your elbows down toward your sides, bringing the bar to your upper chest.', 'Pause briefly.', 'Let the bar rise slowly until your arms are straight and your lats stretch.'],
  cues: ['Lead with your elbows, not your hands.', 'Chest up, lean back only a little.'],
  mistakes: ['Leaning way back and rowing the weight down.', 'Stopping short of a full stretch at the top.'],
});
fam({
  id: 'pullup', label: 'Pullup', main: 'Pullup (Normal Grip)',
  test: (n) => /^(Pullup|Assisted Pullup)/.test(n),
  muscles: ['Lats', 'Upper back', 'Biceps'],
  setup: ['Hang from the bar with the grip the variation calls for, arms straight.', 'Brace your abs and keep your legs still.'],
  steps: ['Pull your elbows down and in until your chin clears the bar.', 'Lower yourself under control to a full hang.'],
  cues: ['Think about driving your elbows into your back pockets.', 'Full hang at the bottom of every rep.'],
  mistakes: ['Kipping or swinging.', 'Half reps that never reach a full hang.'],
});
fam({
  id: 'row_bb', label: 'Barbell row', main: 'Barbell Bent Over Row',
  test: (n) => /^(Barbell Bent Over Row|Barbell Row to Chest|Barbell Flexion Row|Cambered Bar Row|EZ Bar Row|Seal Row|Smith Machine Row|Landmine Row|Meadows Row|T-Bar Row)/.test(n),
  muscles: ['Upper back', 'Lats', 'Rear delts', 'Biceps'],
  setup: ['Hinge at the hips with a flat back and soft knees, letting the weight hang at arm\'s length.', 'Brace your abs hard.'],
  steps: ['Row the weight toward your lower chest or upper belly.', 'Squeeze your shoulder blades together at the top.', 'Lower it under control until your arms are straight.'],
  cues: ['Your torso angle stays the same the whole set.', 'Pull with your elbows.'],
  mistakes: ['Standing up more with every rep.', 'Jerking the weight with your lower back.'],
});
fam({
  id: 'row_db', label: 'Dumbbell row', main: 'Dumbbell Row (Single-Arm, Supported)',
  test: (n) => /^Dumbbell (Row|Flexion Row)/.test(n),
  muscles: ['Lats', 'Upper back', 'Rear delts', 'Biceps'],
  setup: ['Support yourself on a bench or hinge forward with a flat back.', 'Let the dumbbell hang straight down from your shoulder.'],
  steps: ['Row the dumbbell back toward your hip.', 'Pause with your elbow behind your body.', 'Lower it until your arm is straight and your lat stretches.'],
  cues: ['Pull toward your hip, not your armpit, to hit the lats.', 'Keep your shoulders level.'],
  mistakes: ['Twisting your torso to lift more.', 'Shrugging the weight up.'],
});
fam({
  id: 'row_machine', label: 'Machine and cable row', main: 'Seated Cable Row',
  test: (n) => /^(Seated Cable Row|Chest Supported Row|Machine Chest Supported Row|Hammer Machine Row|Cable Flexion Row)/.test(n),
  muscles: ['Upper back', 'Lats', 'Rear delts', 'Biceps'],
  setup: ['Set the seat or chest pad so the handles are at chest height when your arms are straight.', 'Sit tall with your chest against the pad or your knees slightly bent.'],
  steps: ['Pull the handles toward your body, driving your elbows back.', 'Squeeze your shoulder blades together.', 'Let your arms go forward slowly into a full stretch.'],
  cues: ['Keep your chest up and still.', 'Reach forward at the end of each rep.'],
  mistakes: ['Rocking back and forth to move the weight.', 'Shrugging toward your ears.'],
});
fam({
  id: 'pullover', label: 'Pullover', main: 'Cable Pullover',
  test: (n) => /Pullover|Pulldown \(Straight Arm\)/.test(n),
  muscles: ['Lats', 'Chest', 'Triceps (long head)'],
  setup: ['Hold the bar, rope, handle or dumbbell with straight arms out in front or overhead.', 'Keep a small fixed bend in your elbows.'],
  steps: ['Sweep your arms down in an arc toward your hips.', 'Squeeze your lats at the bottom.', 'Let your arms rise back slowly into a stretch.'],
  cues: ['Arms stay long; the movement comes from your shoulders.', 'Keep your ribs down.'],
  mistakes: ['Bending the elbows and turning it into a triceps extension.', 'Arching your lower back at the top.'],
});
fam({
  id: 'back_ext', label: 'Back extension', main: 'Back Extension',
  test: (n) => /^(Back Extension|Back Raise|Reverse Hyper)/.test(n),
  muscles: ['Lower back', 'Glutes', 'Hamstrings'],
  setup: ['Set the pad just below your hip bones.', 'Hook your heels under the rollers. Hold a plate to your chest if you add weight.'],
  steps: ['Lower your torso until you feel a stretch in your hamstrings.', 'Raise back up until your body is in a straight line.'],
  cues: ['Move smoothly; no bouncing at the bottom.', 'Squeeze your glutes at the top.'],
  mistakes: ['Swinging up past straight and overarching.', 'Using momentum.'],
});
fam({
  id: 'inverted_row', label: 'Inverted row', main: 'Inverted Row',
  test: (n) => /^Inverted Row/.test(n),
  muscles: ['Upper back', 'Lats', 'Biceps'],
  setup: ['Set a bar in a rack about waist high and hang underneath it with straight arms.', 'Keep your body straight from head to heels.'],
  steps: ['Pull your chest up to the bar.', 'Lower yourself until your arms are straight.'],
  cues: ['Squeeze your glutes to keep your hips up.'],
  mistakes: ['Letting your hips sag.', 'Craning your neck toward the bar.'],
});

// ---------------- SHOULDERS ----------------
fam({
  id: 'ohp', label: 'Overhead press', main: 'Barbell Shoulder Press (Standing)',
  test: (n) => /Shoulder Press|^Arnold Press|^Dumbbell Press \(High Incline\)/.test(n),
  muscles: ['Front delts', 'Side delts', 'Triceps'],
  setup: ['Hold the weight at shoulder height with your forearms vertical.', 'Brace your abs and squeeze your glutes (or sit tall against the pad).'],
  steps: ['Press straight up until your arms are locked out over your head.', 'Lower it under control back to your shoulders.'],
  cues: ['Move your head back out of the way, then through once the weight passes.', 'Keep your ribs down; do not lean back.'],
  mistakes: ['Leaning back into a standing incline press.', 'Stopping high and skipping the bottom of the rep.'],
});
fam({
  id: 'lateral', label: 'Lateral raise', main: 'Dumbbell Lateral Raise',
  test: (n) => /Lateral Raise|Y-Raises/.test(n) && !/Bent Lateral|Bent Over/.test(n),
  muscles: ['Side delts'],
  setup: ['Stand or sit tall with the weight at your side.', 'Lean slightly forward and keep a soft bend in your elbows.'],
  steps: ['Raise your arms out to the side until they are about level with your shoulders.', 'Lower slowly to your sides.'],
  cues: ['Lead with your elbows and think about reaching out to the walls.', 'Keep your shoulders down away from your ears.'],
  mistakes: ['Swinging the weight up with your body.', 'Shrugging as you lift.'],
});
fam({
  id: 'rear_delt', label: 'Rear delt raise', main: 'Machine Reverse Flye',
  test: (n) => /Rear Delt|Reverse Flye|Bent Lateral Raise|Cross Body Bent/.test(n),
  muscles: ['Rear delts', 'Upper back'],
  setup: ['Set up so your arms start in front of you, either bent over or facing the machine.', 'Keep a soft bend in your elbows.'],
  steps: ['Sweep your arms out and back in a wide arc.', 'Pause when your arms are in line with your body.', 'Return slowly.'],
  cues: ['Think about pushing the weight out wide, not pulling it back.', 'Keep your shoulder blades from squeezing too hard; the rear delts should do the work.'],
  mistakes: ['Turning it into a row.', 'Using too much weight and swinging.'],
});
fam({
  id: 'facepull', label: 'Face pull', main: 'Cable Rope Facepull',
  test: (n) => /Facepull/.test(n),
  muscles: ['Rear delts', 'Upper back', 'Rotator cuff'],
  setup: ['Set the pulley around face height (or use the weight the variation calls for).', 'Grab the handles with your palms facing in or down.'],
  steps: ['Pull toward your face, splitting your hands apart beside your ears.', 'Pause with your elbows high.', 'Let your arms go forward slowly.'],
  cues: ['Elbows stay at least as high as your hands.', 'Finish like a double biceps pose.'],
  mistakes: ['Leaning back to pull more weight.', 'Pulling to your chest with low elbows.'],
});
fam({
  id: 'front_raise', label: 'Front raise', main: 'Dumbbell Front Raise',
  test: (n) => /Front Raise/.test(n),
  muscles: ['Front delts'],
  setup: ['Stand tall with the weight in front of your thighs.'],
  steps: ['Raise the weight in front of you to about eye level.', 'Lower it slowly.'],
  cues: ['Keep your torso still.', 'Slight bend in the elbows.'],
  mistakes: ['Swinging the weight up with your hips.'],
});
fam({
  id: 'upright_row', label: 'Upright row', main: 'Cable Upright Row',
  test: (n) => /Upright Row/.test(n),
  muscles: ['Side delts', 'Traps'],
  setup: ['Stand tall holding the weight in front of your thighs with a grip about shoulder width or wider.'],
  steps: ['Pull the weight up along your body, leading with your elbows.', 'Stop when your elbows reach shoulder height.', 'Lower slowly.'],
  cues: ['Elbows stay above your hands.', 'A wider grip is easier on the shoulders.'],
  mistakes: ['Narrow grip and pulling too high if your shoulders complain.'],
});
fam({
  id: 'shrug', label: 'Shrug', main: 'Barbell Shrug',
  test: (n) => /Shrug/.test(n),
  muscles: ['Traps'],
  setup: ['Hold the weight at your sides or in front of you with straight arms.'],
  steps: ['Lift your shoulders straight up toward your ears.', 'Pause at the top.', 'Lower all the way down for a stretch.'],
  cues: ['Up and down, no rolling.', 'Use straps if your grip gives out first.'],
  mistakes: ['Bending the elbows to help.', 'Tiny reps with too much weight.'],
});

// ---------------- ARMS ----------------
fam({
  id: 'curl_bb', label: 'Barbell curl', main: 'Barbell Curl (Normal Grip)',
  test: (n) => /^(Barbell Curl|EZ Bar Curl|Reverse Curl)/.test(n),
  muscles: ['Biceps', 'Forearms'],
  setup: ['Stand tall holding the bar at arm\'s length with an underhand grip.', 'Pin your elbows at your sides.'],
  steps: ['Curl the bar up toward your shoulders.', 'Squeeze at the top.', 'Lower slowly until your arms are straight.'],
  cues: ['Elbows stay still.', 'Full stretch at the bottom of every rep.'],
  mistakes: ['Swinging with your hips.', 'Elbows drifting forward to cheat the top.'],
});
fam({
  id: 'curl_db', label: 'Dumbbell curl', main: 'Dumbbell Curl (2-Arm)',
  test: (n) => /^(Dumbbell Curl|Dumbbell Twist Curl|Hammer Curl|Concentration Curl|Decline Dumbbell Curl|Lying Biceps Dumbbell Curl|Lying Dumbbell Curl|Dumbbell Spider Curl)/.test(n),
  muscles: ['Biceps', 'Brachialis', 'Forearms'],
  setup: ['Hold the dumbbells at arm\'s length, in the position the variation calls for.'],
  steps: ['Curl the dumbbells up, turning your palms up as they rise (unless it is a hammer curl).', 'Squeeze at the top.', 'Lower slowly to a full stretch.'],
  cues: ['Keep your upper arm still.', 'Control the lowering for two seconds or so.'],
  mistakes: ['Swinging the weights.', 'Cutting the stretch short.'],
});
fam({
  id: 'curl_cable', label: 'Cable curl', main: 'Cable Curl',
  test: (n) => /^(Cable Curl|Cable Hammer Curl|Cable Rope Twist Curl|Bayesian Curl|Lying Cable Curl|Freemotion Curl)/.test(n),
  muscles: ['Biceps', 'Brachialis'],
  setup: ['Set the pulley low (or behind you for a Bayesian curl) and grab the handle.', 'Stand or lie so the cable pulls straight against your forearm.'],
  steps: ['Curl the handle up toward your shoulder.', 'Squeeze at the top.', 'Lower slowly to straight arms.'],
  cues: ['Keep your elbows pinned.', 'The cable keeps tension at the bottom, so use it.'],
  mistakes: ['Leaning back to move the stack.'],
});
fam({
  id: 'curl_preacher', label: 'Preacher curl', main: 'EZ Bar Preacher Curl',
  test: (n) => /Preacher Curl|EZ Bar Spider Curl/.test(n),
  muscles: ['Biceps', 'Brachialis'],
  setup: ['Set the seat so your armpits sit snugly on top of the pad.', 'Rest the backs of your upper arms flat on the pad.'],
  steps: ['Curl the weight up until your forearms are about vertical.', 'Lower slowly until your arms are almost straight.'],
  cues: ['Keep your upper arms glued to the pad.', 'Be gentle at the bottom; the stretch is strong here.'],
  mistakes: ['Dropping into the bottom.', 'Lifting your elbows off the pad.'],
});
fam({
  id: 'tri_pushdown', label: 'Triceps pushdown', main: 'Cable Triceps Pushdown (Bar)',
  test: (n) => /Pushdown/.test(n),
  muscles: ['Triceps'],
  setup: ['Set the pulley high and grab the bar or rope.', 'Pin your elbows at your sides, lean forward slightly.'],
  steps: ['Push down until your arms are straight.', 'Squeeze your triceps.', 'Let the handle rise until your forearms pass parallel.'],
  cues: ['Only your forearms move.', 'With a rope, spread the ends apart at the bottom.'],
  mistakes: ['Elbows drifting forward and back.', 'Using your body weight to push.'],
});
fam({
  id: 'tri_overhead', label: 'Overhead triceps extension', main: 'Cable Overhead Triceps Extension',
  test: (n) => /Overhead (Triceps )?Extension/.test(n),
  muscles: ['Triceps (long head)'],
  setup: ['Hold the weight overhead (or face away from a cable) with your elbows pointing forward.', 'Brace your abs so your lower back does not arch.'],
  steps: ['Lower the weight behind your head by bending your elbows into a deep stretch.', 'Extend your arms until they are straight.'],
  cues: ['Keep your elbows from flaring wide.', 'The deep stretch is the point. Go slow there.'],
  mistakes: ['Arching your back.', 'Turning it into a pullover by moving your shoulders.'],
});
fam({
  id: 'tri_skull', label: 'Skullcrusher', main: 'EZ Bar Skullcrusher',
  test: (n) => /Skullcrusher|JM Press|Machine Triceps Extension|Cable Tricep Kickback/.test(n),
  muscles: ['Triceps'],
  setup: ['Lie on a bench holding the weight over your shoulders with straight arms (or set up the machine so your elbows line up with its pivot).'],
  steps: ['Bend your elbows to lower the weight toward your forehead or just behind your head.', 'Extend your arms back to straight.'],
  cues: ['Let your upper arms tilt back slightly for more stretch.', 'Lower under control.'],
  mistakes: ['Flaring the elbows wide.', 'Going too heavy and hurting your elbows.'],
});
fam({
  id: 'close_grip', label: 'Close grip bench press', main: 'Bench Press (Close Grip)',
  test: (n) => /Bench Press \(Close Grip\)/.test(n),
  muscles: ['Triceps', 'Chest', 'Front delts'],
  setup: ['Set up like a bench press but grip the bar about shoulder width.'],
  steps: ['Lower the bar to your lower chest with your elbows tucked.', 'Press up to straight arms.'],
  cues: ['Elbows stay close to your body.'],
  mistakes: ['Gripping so narrow your wrists bend.'],
});
fam({
  id: 'wrist_curl', label: 'Wrist curl', main: 'Dumbbell Bench Wrist Curl',
  test: (n) => /Wrist Curl|Grip Roller/.test(n),
  muscles: ['Forearms'],
  setup: ['Rest your forearms on a bench or your thighs, or stand holding the weight behind you, palms up.'],
  steps: ['Let the weight roll down toward your fingertips.', 'Curl your wrists up as high as they go.'],
  cues: ['Small movement, big squeeze.', 'Slow, controlled reps.'],
  mistakes: ['Moving your elbows or using your arms.'],
});

// ---------------- LEGS ----------------
fam({
  id: 'squat', label: 'Barbell squat', main: 'Barbell Squat (High Bar)',
  test: (n) => /^(Barbell Squat|Front Squat|Smith Machine Squat)/.test(n),
  muscles: ['Quads', 'Glutes', 'Adductors'],
  setup: ['Set the bar in the rack at about mid-chest height.', 'Get under it, set it in place, brace, and stand it up.', 'Step back and set your feet about shoulder width.'],
  steps: ['Take a big breath and brace.', 'Sit down between your heels with your knees moving out over your toes.', 'Go as deep as you can with a neutral back, then stand up.'],
  cues: ['Whole foot pressure on the floor.', 'Chest up and knees out.'],
  mistakes: ['Knees caving in.', 'Hips shooting up first out of the bottom.', 'Cutting depth as the set gets hard.'],
});
fam({
  id: 'leg_press', label: 'Leg press and machine squat', main: 'Leg Press',
  test: (n) => /^(Leg Press|Single Leg Press|Hack Squat|Pendulum Squat|Belt Squat|Rogers Squat)/.test(n) && !/Calves/.test(n),
  muscles: ['Quads', 'Glutes'],
  setup: ['Sit or stand in the machine with your back flat on the pad.', 'Place your feet about shoulder width in the middle of the platform.'],
  steps: ['Release the safeties.', 'Lower under control as deep as you can without your lower back peeling off the pad.', 'Push back up without locking your knees hard.'],
  cues: ['Push through your whole foot.', 'Keep your knees in line with your toes.'],
  mistakes: ['Bouncing out of the bottom.', 'Letting your hips roll up off the seat.'],
});
fam({
  id: 'leg_ext', label: 'Leg extension', main: 'Leg Extension',
  test: (n) => /Leg Extension/.test(n),
  muscles: ['Quads'],
  setup: ['Line your knees up with the machine\'s pivot.', 'Set the pad just above your ankles and hold the handles.'],
  steps: ['Straighten your legs until they are fully extended.', 'Squeeze for a moment.', 'Lower slowly until your knees are well bent.'],
  cues: ['Lean back slightly for more quad stretch.'],
  mistakes: ['Kicking the weight up.', 'Lifting your butt off the seat.'],
});
fam({
  id: 'sissy', label: 'Sissy and bodyweight squat', main: 'Sissy Squat (No Machine)',
  test: (n) => /Sissy Squat|Bodyweight Squat/.test(n),
  muscles: ['Quads'],
  setup: ['Hold something sturdy for balance.'],
  steps: ['Lean back and let your knees travel forward as you lower.', 'Go as low as you can control, then stand back up.'],
  cues: ['Keep your hips and torso in a line for sissy squats.'],
  mistakes: ['Going deeper than your knees are ready for on day one.'],
});
fam({
  id: 'split_squat', label: 'Split squat and lunge', main: 'Dumbbell Split Squat',
  test: (n) => /Split Squat|Lunge/.test(n),
  muscles: ['Quads', 'Glutes', 'Adductors'],
  setup: ['Take a long stance with one foot forward (the back foot on a bench for a Bulgarian split squat).', 'Hold the weight the variation calls for.'],
  steps: ['Lower straight down until your back knee nearly touches the floor.', 'Drive up through your front foot.', 'Do all reps on one side, then switch.'],
  cues: ['Lean forward slightly to bias glutes, stay upright to bias quads.', 'Front heel stays down.'],
  mistakes: ['Stance too short so the front knee jams forward.', 'Pushing off the back leg.'],
});
fam({
  id: 'goblet', label: 'Goblet and dumbbell squat', main: 'Goblet Squat',
  test: (n) => /Goblet Squat|Dumbbell Front Squat/.test(n),
  muscles: ['Quads', 'Glutes'],
  setup: ['Hold the dumbbell (or dumbbells) at your chest.', 'Feet about shoulder width.'],
  steps: ['Sit straight down between your heels.', 'Stand back up, keeping your chest tall.'],
  cues: ['Elbows inside your knees at the bottom.'],
  mistakes: ['Letting the weight pull your chest forward.'],
});
fam({
  id: 'adduction', label: 'Hip adduction and abduction', main: 'Hip Adduction',
  test: (n) => /Hip Adduction|Hip Abduction/.test(n),
  muscles: ['Adductors', 'Glutes (abduction)'],
  setup: ['Set the machine to a comfortable start stretch.', 'Sit tall and hold the handles.'],
  steps: ['Squeeze your legs together (adduction) or push them apart (abduction).', 'Return slowly to the stretch.'],
  cues: ['Lean forward slightly on abduction for more glutes.'],
  mistakes: ['Letting the weights slam.'],
});
fam({
  id: 'deadlift', label: 'Deadlift', main: 'Deadlift',
  test: (n) => /^(Deadlift|Trap Bar Deadlift)/.test(n),
  muscles: ['Glutes', 'Hamstrings', 'Lower back', 'Upper back'],
  setup: ['Stand with the bar over your mid foot.', 'Hinge down and grab the bar just outside your legs.', 'Pull your chest up and the slack out of the bar.'],
  steps: ['Push the floor away and stand up with the bar close to your legs.', 'Finish standing tall with your glutes squeezed.', 'Lower it by pushing your hips back, then bending your knees once it passes them.'],
  cues: ['Bar stays in contact with your legs.', 'Brace hard before each rep.'],
  mistakes: ['Rounding your lower back.', 'Jerking the bar off the floor.', 'Leaning back at the top.'],
});
fam({
  id: 'rdl', label: 'Stiff-legged deadlift', main: 'Stiff-Legged Deadlift',
  test: (n) => /Stiff.Legged Deadlift|Romanian Deadlift/.test(n),
  muscles: ['Hamstrings', 'Glutes', 'Lower back'],
  setup: ['Stand tall holding the weight in front of your thighs.', 'Soft knees that stay soft the whole set.'],
  steps: ['Push your hips back and slide the weight down your legs.', 'Stop when you feel a strong hamstring stretch, usually mid shin.', 'Drive your hips forward to stand up.'],
  cues: ['Flat back the whole time.', 'Think hips back, not chest down.'],
  mistakes: ['Squatting the weight down.', 'Rounding your back to reach lower.'],
});
fam({
  id: 'good_morning', label: 'Good morning', main: 'Barbell Good Morning (High Bar)',
  test: (n) => /Good Morning/.test(n),
  muscles: ['Hamstrings', 'Glutes', 'Lower back'],
  setup: ['Set the bar on your upper back like a squat.', 'Soft knees, feet about hip width.'],
  steps: ['Push your hips back and lower your chest toward the floor with a flat back.', 'Stop at a strong hamstring stretch.', 'Drive your hips forward to stand up.'],
  cues: ['Brace like a squat.', 'Start light; this one is strong in the stretch.'],
  mistakes: ['Rounding your back.', 'Bending the knees so much it becomes a squat.'],
});
fam({
  id: 'leg_curl', label: 'Leg curl', main: 'Seated Leg Curl',
  test: (n) => /Leg Curl|Nordic Curl/.test(n),
  muscles: ['Hamstrings'],
  setup: ['Line your knees up with the machine\'s pivot.', 'Set the pad just above your heels and lock your thighs in.'],
  steps: ['Curl your heels toward your butt as far as they go.', 'Squeeze for a moment.', 'Let your legs straighten slowly.'],
  cues: ['Point your toes up.', 'Lean forward on a seated curl for a bigger stretch.'],
  mistakes: ['Hips lifting off the pad.', 'Letting the weight drop on the way back.'],
});
fam({
  id: 'hip_thrust', label: 'Hip thrust', main: 'Barbell Hip Thrust',
  test: (n) => /Hip Thrust/.test(n),
  muscles: ['Glutes', 'Hamstrings'],
  setup: ['Sit with your upper back against a bench and the bar (padded) over your hips.', 'Feet flat, about hip width, shins vertical at the top.'],
  steps: ['Drive through your heels to lift your hips until your body is flat from shoulders to knees.', 'Squeeze your glutes hard.', 'Lower under control.'],
  cues: ['Chin tucked, ribs down.', 'Pause at the top.'],
  mistakes: ['Arching your lower back instead of moving your hips.', 'Feet too far out, which shifts it to the hamstrings.'],
});
fam({
  id: 'glute_iso', label: 'Glute kickback and pull through', main: 'Cable Pull Through',
  test: (n) => /Kickback|Pull Through/.test(n) && !/Tricep/.test(n),
  muscles: ['Glutes', 'Hamstrings'],
  setup: ['Set the cable low (or set the machine pad) and take a stable stance.'],
  steps: ['Drive your hip back or your leg back, squeezing your glute.', 'Pause at full hip extension.', 'Return slowly.'],
  cues: ['Do not arch your lower back to get extra range.'],
  mistakes: ['Swinging the leg or the weight.'],
});

// ---------------- CALVES, ABS ----------------
fam({
  id: 'calves', label: 'Calf raise', main: 'Standing Calf Raise',
  test: (n) => /Calves|Calf/.test(n),
  muscles: ['Calves'],
  setup: ['Put the balls of your feet on the edge of the platform.', 'Knees straight but not locked.'],
  steps: ['Lower your heels as far as they go and pause in the stretch.', 'Rise up on your toes as high as you can.', 'Pause at the top.'],
  cues: ['Pause at the bottom for about a second to kill the bounce.'],
  mistakes: ['Bouncing short reps.', 'Bending the knees to help.'],
});
fam({
  id: 'crunch', label: 'Crunch and sit-up', main: 'Cable Rope Crunch',
  test: (n) => /Crunch|Sit-Up|V-Up|Candlestick|Ab Wheel/.test(n),
  muscles: ['Abs'],
  setup: ['Set up in the position the variation calls for, with your abs braced.'],
  steps: ['Curl your ribs toward your hips, rounding your spine.', 'Squeeze your abs hard.', 'Return slowly to a stretch.'],
  cues: ['Think about crunching your spine, not bending at the hips.', 'Exhale as you crunch.'],
  mistakes: ['Pulling with your arms or neck.', 'Hinging at the hips so your hip flexors do the work.'],
});
fam({
  id: 'leg_raise', label: 'Hanging leg raise', main: 'Hanging Knee Raise',
  test: (n) => /Hanging/.test(n),
  muscles: ['Abs', 'Hip flexors'],
  setup: ['Hang from a bar with straight arms or in elbow straps.'],
  steps: ['Raise your knees (or straight legs) and curl your pelvis up toward your chest.', 'Lower slowly without swinging.'],
  cues: ['Tilt your pelvis up at the top; that is where your abs work.'],
  mistakes: ['Swinging.', 'Only lifting the legs to hip height.'],
});

// ---------------- variation notes, from the words in the name ----------------
const MODS = [
  [/High Incline/, { ratio: 0.75, setup: 'Set the bench to a steep incline, about 45 to 60 degrees.', cue: 'This angle hits more front delt; expect to use less weight.' }],
  [/Medium Incline/, { ratio: 0.85, setup: 'Set the bench to about 30 to 40 degrees.' }],
  [/Low Incline/, { ratio: 0.9, setup: 'Set the bench to a low incline, about 15 to 20 degrees.' }],
  [/(?<!(?:High|Medium|Low) )\bIncline\b/, { ratio: 0.85, setup: 'Set the bench to an incline of about 30 degrees.' }],
  [/Decline/, { ratio: 1.0, setup: 'Use a decline bench and lock your legs in.' }],
  [/Narrow Grip|Close Stance|Narrow Stance/, { ratio: 0.92, setup: 'Use a narrower grip or stance than usual.' }],
  [/Wide Grip|Wide Stance|Sumo Stance/, { ratio: 0.97, setup: 'Use a wider grip or stance than usual.' }],
  [/Underhand/, { ratio: 0.95, setup: 'Use an underhand grip, palms facing you.' }],
  [/Parallel Grip/, { ratio: 1.0, setup: 'Use a neutral grip, palms facing each other.' }],
  [/Single.Arm|Single Leg|Single-Leg|Single Arm/, { ratio: 0.55, setup: 'Work one side at a time. Do all the reps on your weaker side first, then match them on the other side.' }],
  [/Seated/, { ratio: 0.95, setup: 'Sit tall with your back supported.' }],
  [/Standing/, { ratio: 1.0, cue: 'Squeeze your glutes so you stay stable while standing.' }],
  [/Weighted/, { ratio: 1.0, setup: 'Add weight with a dip belt, a vest, or a plate. Log only the added weight.' }],
  [/Paused/, { ratio: 0.9, cue: 'Pause for a full second at the hardest point of every rep.' }],
  [/Deficit/, { ratio: 0.92, setup: 'Stand on a low platform or plates so you start deeper than usual.' }],
  [/Cambered Bar/, { ratio: 0.92, setup: 'Use the cambered bar; its bend lets you go deeper and changes the balance.' }],
  [/Safety Bar/, { ratio: 0.9, setup: 'Use the safety squat bar and hold its handles in front of you.' }],
  [/Low Bar/, { ratio: 1.05, setup: 'Set the bar lower on your back, across the rear delts.' }],
  [/Feet Forward/, { ratio: 0.95, setup: 'Set your feet a little forward of the bar to load the quads more.' }],
  [/Glute-Focused/, { ratio: 1.0, cue: 'Take a longer step and lean your torso forward a little to load the glutes.' }],
  [/Quad-Focused/, { ratio: 1.0, cue: 'Take a shorter step and stay upright so your front knee travels forward.' }],
  [/Chest-Focused/, { ratio: 1.0, cue: 'Lean forward and let your elbows flare a little to load the chest.' }],
  [/Triceps-Focused/, { ratio: 1.0, cue: 'Stay upright with your elbows tucked to load the triceps.' }],
  [/\(Rope\)|Rope/, { ratio: 0.9, setup: 'Use the rope attachment.' }],
  [/EZ Bar/, { ratio: 1.0, setup: 'Use the EZ bar; the angled grip is easier on your wrists.' }],
  [/Super ROM/, { ratio: 0.8, cue: 'Take the weight all the way up overhead for the longest range.' }],
  [/Top Hold/, { ratio: 0.85, cue: 'Hold the top position for a second on every rep.' }],
  [/Thumbs Down/, { ratio: 0.95, cue: 'Turn your thumbs slightly down as you raise.' }],
  [/Leaning/, { ratio: 0.9, setup: 'Hold a post with your free hand and lean away from it for more stretch at the bottom.' }],
  [/Kneeling/, { ratio: 0.95, setup: 'Kneel facing the cable.' }],
  [/Bent Over/, { ratio: 0.95, setup: 'Hinge forward with a flat back.' }],
  [/Alternating/, { ratio: 1.0, setup: 'Alternate arms each rep.' }],
  [/2-Arm/, { ratio: 1.0, setup: 'Work both arms together.' }],
  [/Assisted/, { ratio: 1.0, setup: 'Set the assistance so you can do the reps cleanly. Log the assistance weight; less assistance is harder.' }],
  [/Flexion/, { ratio: 0.9, cue: 'Let your upper back round forward at the bottom and arch back as you pull, through a long range.' }],
  [/Straight Arm/, { ratio: 1.0, setup: 'Stand facing the high pulley and hinge forward a little with straight arms.' }],
  [/Upright Torso to Abs/, { ratio: 0.95, cue: 'Stay upright and pull the bar down all the way to your abs.' }],
  [/Facing Away/, { ratio: 1.0, setup: 'Stand facing away from the machine so the cable pulls your arm behind you.' }],
  [/Facing Machine/, { ratio: 1.0, setup: 'Stand facing the machine.' }],
  [/High\)/, { ratio: 1.0, setup: 'Use the high handles or high pulley setting.' }],
  [/Low\)/, { ratio: 1.0, setup: 'Use the low handles or low pulley setting.' }],
  [/Supported/, { ratio: 1.0, setup: 'Brace your free hand and knee on a bench.' }],
  [/Cross Body/, { ratio: 0.9, setup: 'Grab the low cable with the far hand so it crosses in front of your body.' }],
  [/To Hips|to Hips/, { ratio: 1.0, cue: 'Pull toward your hip to bias the lats.' }],
];
// Equipment differences against each family's main lift, for one implement (one dumbbell)
const EQUIP = {
  Barbell: 1, 'Smith machine': 1.0, Machine: 1.0, Cable: 0.9, Freemotion: 0.85, Dumbbell: 0.4,
  'Bodyweight only': 1, 'Bodyweight + added weight': 1, 'Machine assisted': 1,
};
const EQUIP_NOTE = {
  Dumbbell: 'Dumbbells: weight is for ONE dumbbell.',
  'Bodyweight + added weight': 'Log only the weight you add. The app adds your bodyweight for strength estimates.',
  'Machine assisted': 'Log the assistance weight. Less assistance means harder.',
  'Bodyweight only': 'Bodyweight only: progress by adding reps.',
};


// Exercises that move differently enough from their family to need their own words
const OVERRIDES = {
  'Ab Wheel': { setup: ['Kneel on a mat holding the wheel under your shoulders.', 'Tuck your pelvis and brace your abs.'], steps: ['Roll the wheel forward slowly, letting your hips follow.', 'Go as far as you can without your lower back sagging.', 'Pull back to the start using your abs.'], cues: ['Keep your hips tucked the whole time.'], mistakes: ['Letting your lower back arch at the far end.', 'Pulling back with your hips first.'] },
  'Hanging Straight Leg Raise': { cues: ['Keep your legs straight and curl your pelvis up at the top.'] },
  'Modified Candlestick': { setup: ['Lie on a bench and hold it behind your head.', 'Raise your legs toward the ceiling, knees slightly bent.'], steps: ['Lower your legs and hips slowly toward the bench.', 'Curl your hips back up toward the ceiling with your abs.'], cues: ['Move slowly; control beats range.'], mistakes: ['Swinging your legs.'] },
  'Reaching Sit-Up': { setup: ['Lie on your back with your knees bent and arms overhead.'], steps: ['Curl up and reach toward your feet.', 'Lower back down one vertebra at a time.'], cues: ['Reach long with your arms.'], mistakes: ['Yanking up with momentum.'] },
  'Slant Board Sit-Up (Weighted)': { setup: ['Hook your feet on the decline board and hold a plate to your chest.'], steps: ['Lower back until your back is almost flat.', 'Curl up until your torso is upright.'], cues: ['Round your spine on the way up; do not just hinge at the hips.'] },
  'V-Up (Weighted)': { setup: ['Lie flat holding a light weight overhead.'], steps: ['Raise your legs and torso together, reaching the weight toward your shins.', 'Lower both under control.'], cues: ['Exhale at the top.'] },
  'Grip Roller': { setup: ['Hold the roller with your arms out in front, elbows straight or bent at 90 degrees.'], steps: ['Roll the weight up by turning your wrists one at a time.', 'Roll it back down slowly.'], cues: ['Keep your shoulders down.'], mistakes: ['Using your arms instead of your wrists.'] },
  'Nordic Curl': { setup: ['Kneel with your ankles locked under a pad or held by a partner.'], steps: ['Lower your body forward as slowly as you can, straight from knees to head.', 'Catch yourself with your hands and push back up, then curl the last part with your hamstrings.'], cues: ['Fight the fall the whole way down.'], mistakes: ['Bending at the hips to make it easier.'] },
  'Inverted Skullcrusher': { setup: ['Hold a bar in a rack (or rings) at about waist height and lean into a plank with straight arms.'], steps: ['Bend your elbows to lower your forehead toward the bar.', 'Push back to straight arms.'], cues: ['Lower the bar or step your feet back to make it harder.'] },
  'Reverse Hyper': { setup: ['Lie face down on the pad with your hips at the edge, holding the handles.', 'Hook your ankles into the strap.'], steps: ['Swing your legs up behind you until they are in line with your body.', 'Lower them under control.'], cues: ['Squeeze your glutes at the top.'], mistakes: ['Swinging so hard you lose control at the bottom.'] },
  'Hip Abduction Machine': { steps: ['Push your knees apart against the pads.', 'Pause, then return slowly.'] },
  'Sissy Squat (Machine)': { setup: ['Lock your shins under the pads and your feet on the platform.'] },
  'Belt Squat': { setup: ['Attach the belt around your hips and stand on the platform.', 'Feet about shoulder width.'] },
  'Belt Squat (Wide Stance)': { setup: ['Attach the belt around your hips and stand on the platform with a wide stance.'] },
  'Landmine Row': { setup: ['Straddle the bar and grip it just behind the plates, hinged forward with a flat back.'] },
  'Meadows Row': { setup: ['Stand side-on to the end of a landmine bar, hinge forward and grip the end overhand.'] },
  'Cable Kickback': { setup: ['Attach an ankle cuff to a low cable and hold the machine for balance.'], steps: ['Kick your leg back and slightly out, squeezing your glute.', 'Return slowly.'] },
  'Cable Tricep Kickback': { setup: ['Hinge forward holding a low cable, upper arm pinned at your side.'], steps: ['Straighten your arm back until it is locked out.', 'Return until your forearm is vertical.'], cues: ['Upper arm stays still.'], mistakes: ['Swinging the upper arm.'] },
  'Machine Triceps Extension': { setup: ['Set the seat so your elbows line up with the machine pivot.'] },
  'JM Press': { steps: ['Lower the bar toward your chin with elbows pointing forward, like a mix of a close grip press and a skullcrusher.', 'Press back up to straight arms.'] },
  'Smith Machine JM Press': { steps: ['Lower the bar toward your chin with elbows pointing forward.', 'Press back up to straight arms.'] },
  'Pulldown (Single-Arm)': { setup: ['Use a single handle and sit slightly turned toward the working arm.'] },
  'Barbell Pullover': { setup: ['Lie across or along a bench holding a barbell over your chest with a narrow grip.'] },
  'Dumbbell Pullover': { setup: ['Lie on a bench holding one dumbbell over your chest with both hands.'] },
};

function familyOf(name) { return F.find((f) => f.test(name)) || null; }
function mods(name) { return MODS.filter(([re]) => re.test(name)).map(([, m]) => m); }

// Rough ratio of an exercise to its family's main lift (effective load).
function ratioFor(name, equipment, mainEquipment) {
  let r = 1;
  for (const m of mods(name)) r *= m.ratio || 1;
  const eq = (EQUIP[equipment] || 1) / (EQUIP[mainEquipment] || 1);
  return Math.round(r * eq * 1000) / 1000;
}

// The full how-to for one exercise
function howTo(name, equipment, muscle) {
  const f = familyOf(name);
  const ms = mods(name);
  const o = OVERRIDES[name] || {};
  const fb = f || { setup: [], steps: [], cues: [], mistakes: [], muscles: [muscle] };
  const base = { ...fb, setup: o.setup || fb.setup, steps: o.steps || fb.steps, cues: o.cues ? [...o.cues, ...fb.cues] : fb.cues, mistakes: o.mistakes || fb.mistakes };
  const setup = [...base.setup, ...ms.map((m) => m.setup).filter(Boolean)];
  const cues = [...base.cues, ...ms.map((m) => m.cue).filter(Boolean)];
  if (EQUIP_NOTE[equipment]) cues.push(EQUIP_NOTE[equipment]);
  const muscles = Array.from(new Set([muscle, ...(base.muscles || [])]));
  return { setup: Array.from(new Set(setup)), steps: base.steps.slice(), cues: Array.from(new Set(cues)), mistakes: base.mistakes.slice(), muscles };
}

module.exports = { FAMILIES: F, familyOf, ratioFor, howTo };
