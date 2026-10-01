// Training program: 6-day Push / Pull / Legs+Core, rotating through 3 weekly variants (A → B → C).
// Days 1–3 are skill + strength focused, days 4–6 are volume + shoulders/core focused.
//
// Exercise fields:
//   id     stable key used for history and prefill — variants of the same movement get different ids
//   type   'reps' (bodyweight reps) | 'weight' (kg × reps) | 'time' (seconds)
//   sets, lo, hi   target sets and rep/second range
//   rest   seconds of rest after each set
//   skill  optional key; the best set is tracked on the Progress tab

const EX = {
  // Push skills
  handstand:     { name: 'Freestanding handstand', type: 'time', sets: 4, lo: 20, hi: 40, rest: 60, skill: 'handstand', cue: 'Stack wrists, shoulders, hips. Push tall through the shoulders.' },
  pike_pu:       { name: 'Elevated pike push-up', type: 'reps', sets: 4, lo: 6, hi: 10, rest: 120, cue: 'Feet on a box, hips over shoulders, head goes in front of hands.' },
  hspu_neg:      { name: 'Wall HSPU negative', type: 'reps', sets: 4, lo: 3, hi: 5, rest: 150, cue: '5 seconds down. Kick back up or reset from feet.' },
  hspu:          { name: 'Wall handstand push-up', type: 'reps', sets: 5, lo: 1, hi: 4, rest: 180, skill: 'hspu', cue: 'Singles are fine. Stop a rep short of failure.' },
  planche_str:   { name: 'Straddle planche hold', type: 'time', sets: 5, lo: 5, hi: 12, rest: 120, skill: 'planche', cue: 'Protract hard, posterior pelvic tilt, lock the elbows.' },
  planche_tpu:   { name: 'Tuck planche push-up', type: 'reps', sets: 4, lo: 3, hi: 6, rest: 150, cue: 'Keep the lean; don’t let hips drop on the way up.' },
  pseudo_pu:     { name: 'Pseudo planche push-up', type: 'reps', sets: 4, lo: 6, hi: 12, rest: 120, cue: 'Hands by the hips, fingers out, lean forward the whole set.' },
  planche_lean:  { name: 'Planche lean', type: 'time', sets: 3, lo: 15, hi: 30, rest: 75, cue: 'Lean until it’s hard to hold, protracted and straight-armed.' },

  // Push strength / hypertrophy
  dips:          { name: 'Parallel bar dips', type: 'reps', sets: 4, lo: 8, hi: 15, rest: 120, cue: 'Slight forward lean, shoulders down, full depth. 3 s down when 15 is easy.' },
  incline_db:    { name: 'Incline dumbbell press', type: 'weight', sets: 4, lo: 6, hi: 10, rest: 120 },
  bar_dips:      { name: 'Straight bar dips', type: 'reps', sets: 4, lo: 8, hi: 15, rest: 120, cue: 'Lean over the bar, elbows back. The top half of every muscle-up.' },
  arnold:        { name: 'Arnold press', type: 'weight', sets: 3, lo: 8, hi: 12, rest: 90, cue: 'Rotate from palms-in to palms-out as you press. Front and side delts.' },
  seated_db_ohp: { name: 'Seated dumbbell press', type: 'weight', sets: 3, lo: 8, hi: 12, rest: 90 },
  lat_cable:     { name: 'Cable lateral raise', type: 'weight', sets: 4, lo: 12, hi: 20, rest: 60, cue: 'Side delts build the 3D look. Lead with the elbow.' },
  lat_db:        { name: 'Dumbbell lateral raise', type: 'weight', sets: 4, lo: 12, hi: 20, rest: 60, cue: 'Slow on the way down. No swinging.' },
  lat_lean:      { name: 'Lean-away lateral raise', type: 'weight', sets: 4, lo: 12, hi: 15, rest: 60 },
  decline_pu:    { name: 'Decline push-up', type: 'reps', sets: 4, lo: 10, hi: 20, rest: 90, cue: 'Feet on a bench, body straight. Upper chest and front delts.' },
  deficit_pu:    { name: 'Deficit push-up', type: 'reps', sets: 3, lo: 10, hi: 20, rest: 90, cue: 'Hands on handles or plates, chest below hand level at the bottom. 2 s pause in the stretch.' },
  oh_ext:        { name: 'Overhead triceps extension (cable)', type: 'weight', sets: 3, lo: 10, hi: 15, rest: 60 },
  cable_fly:     { name: 'Cable fly', type: 'weight', sets: 3, lo: 12, hi: 15, rest: 60, cue: 'Slight bend in the elbows, hug the chest, squeeze 1 s.' },
  machine_press: { name: 'Machine chest press', type: 'weight', sets: 4, lo: 8, hi: 12, rest: 90, cue: 'Shoulder blades back, full stretch, squeeze at the top. Mid chest.' },
  machine_lat:   { name: 'Machine lateral raise', type: 'weight', sets: 4, lo: 12, hi: 15, rest: 60, cue: 'Lead with the elbows, pause 1 s at the top.' },
  pulldown_wide: { name: 'Wide-grip lat pulldown', type: 'weight', sets: 4, lo: 10, hi: 12, rest: 90, cue: 'Chest up, pull to the upper chest, elbows down and back.' },
  pec_deck:      { name: 'Pec deck', type: 'weight', sets: 3, lo: 10, hi: 15, rest: 60, cue: 'Slow stretch, 1 s squeeze. Inner and mid chest.' },
  skull:         { name: 'Skull crusher', type: 'weight', sets: 3, lo: 8, hi: 12, rest: 75, cue: 'EZ bar to the forehead, elbows still.' },
  archer_pu:     { name: 'Archer push-up (each side)', type: 'reps', sets: 4, lo: 5, hi: 10, rest: 90, cue: 'Working arm bent, other arm straight out. Path to the one-arm push-up.' },
  bar_tri:       { name: 'Bar triceps extension', type: 'reps', sets: 3, lo: 8, hi: 12, rest: 75, cue: 'Hands on a low bar (Smith or rack), bend only the elbows, forehead under the bar.' },
  pullup_max:    { name: 'Pull-up finisher (max reps)', type: 'reps', sets: 2, fixed: true, lo: 8, hi: 20, rest: 120, cue: 'Dead hang to chin over the bar, no kipping. Stop when form breaks.' },
  pushup_max:    { name: 'Push-up finisher (max reps)', type: 'reps', sets: 2, fixed: true, lo: 20, hi: 40, rest: 90, cue: 'Chest to the floor, full lockout, body straight. Stop when form breaks.' },
  diamond_pu:    { name: 'Diamond push-up', type: 'reps', sets: 3, lo: 10, hi: 20, rest: 60 },
  pushdown:      { name: 'Cable triceps pushdown (rope)', type: 'weight', sets: 3, lo: 10, hi: 15, rest: 60, cue: 'Elbows pinned, spread the rope at the bottom.' },
  cable_y:       { name: 'Cable Y-raise', type: 'weight', sets: 3, lo: 12, hi: 15, rest: 60, cue: 'Lower traps + side delts. Arms make a Y, thumbs up.' },
  rear_fly:      { name: 'Rear delt fly', type: 'weight', sets: 3, lo: 15, hi: 20, rest: 60, cue: 'Pinkies up, think "push the dumbbells apart".' },

  // Pull skills
  muscle_up:     { name: 'Muscle-up', type: 'reps', sets: 5, lo: 3, hi: 5, rest: 150, skill: 'muscle_up', cue: 'Clean reps, no kipping chicken wing.' },
  mu_slow:       { name: 'Slow muscle-up (strict)', type: 'reps', sets: 4, lo: 2, hi: 4, rest: 150, cue: 'False grip, pull to the sternum, lean over the bar.' },
  fl_straddle:   { name: 'Straddle front lever hold', type: 'time', sets: 5, lo: 5, hi: 12, rest: 120, skill: 'front_lever', cue: 'Do these first, fully rested. Depress the shoulders.' },
  fl_raise:      { name: 'Front lever raise (adv. tuck)', type: 'reps', sets: 4, lo: 5, hi: 8, rest: 120, cue: 'Straight arms, raise from hang to lever, control down.' },
  fl_neg:        { name: 'Front lever negative', type: 'reps', sets: 4, lo: 3, hi: 5, rest: 120, cue: 'From inverted hang, 5 seconds down to straddle lever.' },
  fl_tuck:       { name: 'Advanced tuck front lever', type: 'time', sets: 4, lo: 10, hi: 20, rest: 90, cue: 'Volume day: crisp holds, back flat.' },
  back_lever:    { name: 'Back lever hold', type: 'time', sets: 3, lo: 10, hi: 20, rest: 90, skill: 'back_lever' },
  l_pullup:      { name: 'L-sit pull-up', type: 'reps', sets: 4, lo: 5, hi: 10, rest: 120, cue: 'Legs straight out in front the whole rep. Pull + abs in one.' },
  c2b:           { name: 'Chest-to-bar pull-up', type: 'reps', sets: 4, lo: 5, hi: 10, rest: 120 },
  archer:        { name: 'Archer pull-up (each side)', type: 'reps', sets: 4, lo: 3, hi: 6, rest: 120 },
  chin_up:       { name: 'Chin-up', type: 'reps', sets: 4, lo: 8, hi: 12, rest: 90, cue: 'Palms facing you, chest to the bar. Biceps + lats.' },
  australian_row:{ name: 'Australian pull-up (bar row)', type: 'reps', sets: 3, lo: 10, hi: 15, rest: 75, cue: 'Low bar, body straight, pull the chest to the bar, squeeze the shoulder blades.' },
  windshield:    { name: 'Hanging windshield wipers', type: 'reps', sets: 3, lo: 6, hi: 10, rest: 75, cue: 'Legs up to the bar, rotate side to side under control. Obliques.' },
  v_up:          { name: 'V-ups', type: 'reps', sets: 3, lo: 12, hi: 20, rest: 45 },
  jump_squat:    { name: 'Jump squat', type: 'reps', sets: 3, lo: 6, hi: 8, rest: 90, cue: 'Explode up, land soft. Power for dynamic skills.' },
  step_up:       { name: 'Dumbbell step-up', type: 'weight', sets: 3, lo: 8, hi: 12, rest: 75, cue: 'Drive through the top heel. Quads.' },
  pullup:        { name: 'Pull-up', type: 'reps', sets: 4, lo: 8, hi: 12, rest: 90 },
  pullup_wide:   { name: 'Wide-grip pull-up', type: 'reps', sets: 4, lo: 6, hi: 10, rest: 90 },
  pullup_neutral:{ name: 'Neutral-grip pull-up', type: 'reps', sets: 4, lo: 8, hi: 12, rest: 90 },

  // Pull accessories
  bb_row:        { name: 'Barbell row', type: 'weight', sets: 3, lo: 8, hi: 10, rest: 120 },
  cable_row:     { name: 'Seated cable row', type: 'weight', sets: 3, lo: 10, hi: 12, rest: 90 },
  cs_row:        { name: 'Chest-supported dumbbell row', type: 'weight', sets: 3, lo: 10, hi: 12, rest: 90 },
  pulldown:      { name: 'Lat pulldown', type: 'weight', sets: 3, lo: 10, hi: 12, rest: 90 },
  sa_row:        { name: 'Single-arm cable row', type: 'weight', sets: 3, lo: 10, hi: 12, rest: 75 },
  face_pull:     { name: 'Face pull', type: 'weight', sets: 3, lo: 15, hi: 20, rest: 60, cue: 'Pull to the eyes, rotate out, squeeze rear delts.' },
  hammer:        { name: 'Hammer curl', type: 'weight', sets: 3, lo: 10, hi: 12, rest: 60 },
  incline_curl:  { name: 'Incline dumbbell curl', type: 'weight', sets: 3, lo: 10, hi: 12, rest: 60 },

  // Legs
  back_squat:    { name: 'Back squat', type: 'weight', sets: 4, lo: 5, hi: 8, rest: 150 },
  front_squat:   { name: 'Front squat', type: 'weight', sets: 4, lo: 5, hi: 8, rest: 150 },
  bulgarian:     { name: 'Bulgarian split squat', type: 'weight', sets: 3, lo: 8, hi: 12, rest: 90 },
  leg_press:     { name: 'Leg press', type: 'weight', sets: 3, lo: 10, hi: 15, rest: 120 },
  walking_lunge: { name: 'Walking lunge', type: 'weight', sets: 3, lo: 10, hi: 12, rest: 90 },
  rdl:           { name: 'Romanian deadlift', type: 'weight', sets: 3, lo: 8, hi: 10, rest: 120 },
  hip_thrust:    { name: 'Hip thrust (machine or barbell)', type: 'weight', sets: 3, lo: 8, hi: 12, rest: 90 },
  sl_rdl:        { name: 'Single-leg RDL', type: 'weight', sets: 3, lo: 8, hi: 10, rest: 75 },
  leg_curl:      { name: 'Leg curl', type: 'weight', sets: 3, lo: 10, hi: 12, rest: 75 },
  nordic:        { name: 'Nordic curl negative', type: 'reps', sets: 3, lo: 3, hi: 6, rest: 120 },
  calf:          { name: 'Standing calf raise (heavy)', type: 'weight', sets: 4, lo: 8, hi: 12, rest: 60, cue: 'Full stretch at the bottom, 2 s pause. No bouncing.' },
  calf_seated:   { name: 'Seated calf raise', type: 'weight', sets: 4, lo: 12, hi: 20, rest: 45, cue: 'Trains the soleus, the muscle that makes the lower leg look thick.' },
  calf_single:   { name: 'Single-leg calf raise', type: 'weight', sets: 3, lo: 12, hi: 15, rest: 30, cue: 'On a step, dumbbell in one hand. Full range.' },
  tib_raise:     { name: 'Tibialis raise', type: 'reps', sets: 2, fixed: true, lo: 15, hi: 25, rest: 30, cue: 'Back against a wall, lift the toes. Front of the shin.' },
  leg_ext:       { name: 'Leg extension', type: 'weight', sets: 3, lo: 12, hi: 15, rest: 60, cue: 'Pause 1 s at the top. Quads.' },
  sissy:         { name: 'Sissy squat', type: 'reps', sets: 3, lo: 8, hi: 15, rest: 60, cue: 'Knees forward, hips straight. Hold something for balance.' },
  wrist_curl:    { name: 'Wrist curl', type: 'weight', sets: 3, lo: 15, hi: 20, rest: 45, cue: 'Forearms on a bench, let the bar roll to the fingertips.' },
  rev_wrist:     { name: 'Reverse wrist curl', type: 'weight', sets: 3, lo: 15, hi: 20, rest: 45 },
  reverse_curl:  { name: 'Reverse-grip curl', type: 'weight', sets: 3, lo: 10, hi: 12, rest: 60, cue: 'Overhand grip. Builds the top of the forearm.' },
  farmer:        { name: 'Farmer carry', type: 'time', sets: 3, lo: 40, hi: 60, rest: 60, cue: 'Heaviest dumbbells you can hold. Shoulders back and down.' },

  // Core
  ab_wheel:      { name: 'Ab wheel rollout', type: 'reps', sets: 3, lo: 8, hi: 12, rest: 75, cue: 'Hollow position, ribs down, don’t let the hips sag.' },
  hollow:        { name: 'Hollow body hold', type: 'time', sets: 3, lo: 30, hi: 45, rest: 45 },
  hollow_rock:   { name: 'Hollow body rocks', type: 'reps', sets: 3, lo: 15, hi: 25, rest: 45 },
  hlr:           { name: 'Hanging leg raise', type: 'reps', sets: 3, lo: 10, hi: 15, rest: 60, cue: 'Curl the pelvis up, no swinging.' },
  t2b:           { name: 'Toes-to-bar', type: 'reps', sets: 3, lo: 8, hi: 12, rest: 60 },
  dragon_flag:   { name: 'Dragon flag negative', type: 'reps', sets: 3, lo: 4, hi: 6, rest: 90 },
  pallof:        { name: 'Pallof press (each side)', type: 'weight', sets: 3, lo: 10, hi: 12, rest: 45 },
  lsit:          { name: 'L-sit', type: 'time', sets: 4, lo: 10, hi: 20, rest: 60, skill: 'lsit' },
  side_plank:    { name: 'Side plank (each side)', type: 'time', sets: 2, lo: 30, hi: 45, rest: 30 },
  cable_crunch:  { name: 'Kneeling cable crunch', type: 'weight', sets: 3, lo: 12, hi: 15, rest: 60 },
  // Mobility (Sunday + warm-ups)
  wrist_prep:    { name: 'Wrist prep circuit', type: 'time', sets: 1, lo: 120, hi: 180, rest: 0, cue: 'Circles, palm-up/down rocks, fingers-back leans. Essential for planche and handstands.' },
  shoulder_cars: { name: 'Shoulder CARs (each side)', type: 'reps', sets: 2, lo: 5, hi: 5, rest: 0, cue: 'Biggest slow circle you can make without the torso moving.' },
  dislocates:    { name: 'Band shoulder dislocates', type: 'reps', sets: 2, lo: 12, hi: 15, rest: 0 },
  scap_pu:       { name: 'Scapula push-ups', type: 'reps', sets: 2, lo: 10, hi: 12, rest: 0 },
  scap_pull:     { name: 'Scapula pulls (hanging)', type: 'reps', sets: 2, lo: 8, hi: 10, rest: 0 },
  german_hang:   { name: 'German hang', type: 'time', sets: 3, lo: 15, hi: 30, rest: 45, cue: 'Shoulder extension for back lever and tendon health. Ease in, never bounce.' },
  skin_cat:      { name: 'Skin the cat', type: 'reps', sets: 3, lo: 3, hi: 5, rest: 60, cue: 'Slow through the bottom, exhale into the stretch.' },
  active_hang:   { name: 'Active hang', type: 'time', sets: 2, lo: 30, hi: 45, rest: 30 },
  deep_squat:    { name: 'Deep squat hold', type: 'time', sets: 3, lo: 45, hi: 90, rest: 30, cue: 'Heels down, chest up, push the knees out with the elbows.' },
  hip_9090:      { name: '90/90 hip switches', type: 'reps', sets: 2, lo: 8, hi: 10, rest: 30 },
  cossack:       { name: 'Cossack squat (each side)', type: 'reps', sets: 3, lo: 6, hi: 8, rest: 45 },
  couch:         { name: 'Couch stretch (each side)', type: 'time', sets: 2, lo: 45, hi: 60, rest: 0, cue: 'Hip flexors + quads. Squeeze the glute of the back leg.' },
  pancake:       { name: 'Pancake stretch', type: 'time', sets: 3, lo: 45, hi: 60, rest: 30, cue: 'Hips tilt forward, chest to floor. Builds the straddle for press and V-sit.' },
  pike_stretch:  { name: 'Seated pike stretch', type: 'time', sets: 3, lo: 45, hi: 60, rest: 30 },
  jefferson:     { name: 'Jefferson curl (light)', type: 'weight', sets: 3, lo: 6, hi: 8, rest: 60, cue: 'Light weight only. Roll down one vertebra at a time.' },
  compression:   { name: 'Pike compression lifts', type: 'reps', sets: 3, lo: 8, hi: 12, rest: 45, cue: 'Hands beside knees, lift heels. Key for press handstand and V-sit.' },
  bridge:        { name: 'Bridge hold', type: 'time', sets: 3, lo: 20, hi: 30, rest: 45, cue: 'Push the shoulders over the hands, straighten the legs gradually.' },
  thoracic:      { name: 'Thoracic extension on foam roller', type: 'reps', sets: 2, lo: 10, hi: 12, rest: 0 },
  pec_stretch:   { name: 'Doorway pec + lat stretch', type: 'time', sets: 2, lo: 45, hi: 60, rest: 0, cue: 'Undo the tightness from presses and isolation work.' },
  // Posture: rounded shoulders (tight chest/lats in front, weak mid-back and rotator cuff behind)
  pull_apart:    { name: 'Band pull-aparts', type: 'reps', sets: 2, lo: 15, hi: 20, rest: 0, cue: 'Arms straight, squeeze the shoulder blades together and down. Do these every day.' },
  wall_slide:    { name: 'Wall slides', type: 'reps', sets: 2, lo: 10, hi: 12, rest: 0, cue: 'Back, head and forearms against the wall, slide up without the ribs flaring.' },
  ytw:           { name: 'Prone Y-T-W raises', type: 'reps', sets: 2, lo: 8, hi: 10, rest: 30, cue: 'Face down, thumbs up, lift with the mid-back. Light or no weight.' },
  chin_tuck:     { name: 'Chin tucks', type: 'reps', sets: 2, lo: 10, hi: 12, rest: 0, cue: 'Make a double chin, hold 3 s. Fixes forward head posture.' },
  ext_rot:       { name: 'Cable external rotation', type: 'weight', sets: 3, lo: 12, hi: 15, rest: 45, cue: 'Elbow tucked at the side, rotate out slowly. Rotator cuff health.' },
  calf_ankle:    { name: 'Knee-to-wall ankle mobility', type: 'reps', sets: 2, lo: 10, hi: 12, rest: 0 },
};

// Each slot lists [weekA, weekB, weekC] exercise ids. A single id means it stays every week.
const DAYS = {
  // Each day: calisthenics skills first (added from the focused skill ladders, see FAMILY_DAYS in app.js),
  // then gym work. Main lifts stay fixed every week so the weight can go up (progressive overload);
  // only a few accessories rotate between weeks A, B and C.
  1: { title: 'Push', sub: 'Chest, shoulders, triceps', tone: 'push', slots: [
        ['planche_str'],
        ['hspu_neg'],
        ['dips'],
        ['incline_db'],
        ['machine_press'],
        ['arnold'],
        ['lat_db', 'machine_lat', 'lat_db'],
        ['oh_ext'],
        ['pushup_max'],
      ] },
  2: { title: 'Pull', sub: 'Back, rear delts, biceps', tone: 'pull', slots: [
        ['fl_straddle'],
        ['muscle_up'],
        ['pullup'],
        ['cable_row'],
        ['pulldown'],
        ['face_pull'],
        ['rear_fly'],
        ['hammer'],
        ['wrist_curl', 'rev_wrist', 'wrist_curl'],
        ['hlr', 'windshield', 'hlr'],
      ] },
  3: { title: 'Legs', sub: 'Quads, glutes, calves, abs', tone: 'legs', slots: [
        ['handstand'],
        ['lsit'],
        ['back_squat'],
        ['leg_press'],
        ['hip_thrust'],
        ['leg_curl'],
        ['calf'],
        ['cable_crunch'],
        ['ab_wheel'],
      ] },
  4: { title: 'Push', sub: 'Chest, shoulders, triceps', tone: 'push', slots: [
        ['planche_lean'],
        ['dips'],
        ['incline_db'],
        ['pec_deck'],
        ['arnold'],
        ['lat_db', 'machine_lat', 'lat_db'],
        ['pushdown', 'skull', 'pushdown'],
        ['pushup_max'],
      ] },
  5: { title: 'Pull', sub: 'Back, rear delts, arms', tone: 'pull', slots: [
        ['fl_tuck'],
        ['chin_up'],
        ['sa_row'],
        ['pulldown_wide'],
        ['face_pull'],
        ['rear_fly'],
        ['incline_curl'],
        ['reverse_curl'],
        ['t2b', 'hlr', 't2b'],
      ] },
  6: { title: 'Legs', sub: 'Quads, hamstrings, calves, abs', tone: 'legs', slots: [
        ['handstand'],
        ['lsit'],
        ['bulgarian'],
        ['leg_ext'],
        ['rdl'],
        ['calf_seated'],
        ['farmer'],
        ['hollow'],
        ['hlr'],
      ] },
  0: { title: 'Mobility', sub: 'Light skill + flexibility', tone: 'mob', slots: [
        ['wrist_prep'],
        ['shoulder_cars', 'thoracic', 'shoulder_cars'],
        ['german_hang', 'skin_cat', 'german_hang'],
        ['bridge'],
        ['pancake', 'pike_stretch', 'pancake'],
        ['compression'],
        ['deep_squat', 'cossack', 'deep_squat'],
        ['hip_9090'],
        ['couch'],
        ['pec_stretch', 'ytw', 'pec_stretch'],
        ['wall_slide', 'chin_tuck', 'jefferson'],
      ] },
};

// Short warm-up checklist shown before each training day (by day tone).
const WARMUPS = {
  push: ['wrist_prep', 'shoulder_cars', 'pull_apart', 'wall_slide', 'scap_pu'],
  pull: ['dislocates', 'thoracic', 'pull_apart', 'scap_pull', 'active_hang'],
  legs: ['calf_ankle', 'hip_9090', 'deep_squat', 'couch', 'pull_apart', 'chin_tuck'],
};

const SKILLS = [
  { key: 'handstand',   name: 'Handstand',       unit: 's' },
  { key: 'hspu',        name: 'Handstand push-up', unit: 'reps' },
  { key: 'planche',     name: 'Straddle planche', unit: 's' },
  { key: 'front_lever', name: 'Straddle front lever', unit: 's' },
  { key: 'back_lever',  name: 'Back lever',      unit: 's' },
  { key: 'muscle_up',   name: 'Muscle-ups',      unit: 'reps' },
  { key: 'lsit',        name: 'L-sit',           unit: 's' },
];

// The athlete's own recipes. Macros estimated from standard values
// (soy milk 4 g protein/100 ml, dried/pressed tofu ~150 kcal + 16 g protein per 100 g, Greek-style yogurt).
const RECIPES = [
  { id: 'r_breakfast', name: 'Oats, soy milk, banana + protein', kcal: 515, p: 38, day: 1,
    items: ['55 g oats', '200 ml soy milk', '1 big banana', '27 g protein powder'] },
  { id: 'r_lunch', name: 'Tofu, edamame + sweet potato', kcal: 450, p: 36, day: 1,
    items: ['80 g edamame', '150 g dried tofu', '1 medium sweet potato'] },
  { id: 'r_coffee', name: 'Coffee with milk', kcal: 22, p: 1, day: 2,
    items: ['120 g coffee', '40 g milk'] },
  { id: 'r_dinner', name: 'Pasta, eggs + tofu', kcal: 725, p: 53, day: 1,
    items: ['80 g pasta (dry)', '2 eggs', '60 g broccoli', '80 g edamame', '120 g dried tofu'] },
  { id: 'r_snack', name: 'Yogurt, blueberries + banana', kcal: 200, p: 10, day: 1,
    items: ['80 g yogurt', '40 g blueberries', '1 big banana'] },
];
const RECIPES_VERSION = 2;

const DEFAULT_MEALS = [
  ...RECIPES,
  { id: 'm4', name: 'Protein shake', kcal: 130, p: 25 },
  { id: 'm6', name: 'Banana', kcal: 120, p: 1 },
];

// The athlete trains 4 working sets per exercise. Mobility, warm-ups and finishers keep their own counts.
const WORK_SETS = 4;
(function applyWorkSets() {
  const light = new Set([...DAYS[0].slots.flat(), ...Object.values(WARMUPS).flat()]);
  for (const [id, ex] of Object.entries(EX)) if (!light.has(id) && !ex.fixed) ex.sets = Math.max(ex.sets, WORK_SETS);
})();
