'use strict';

/* ================= storage ================= */

const KEY = 'chalk.v1';
const $ = (s, el = document) => el.querySelector(s);

function iso(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function parse(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(s, n) { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); }
function mondayOf(s) { const d = parse(s); const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return iso(d); }
function daysBetween(a, b) { return Math.round((parse(b) - parse(a)) / 864e5); }
const today = () => iso(new Date());
const uid = () => Math.random().toString(36).slice(2, 9);

const TREES = typeof SKILL_TREES !== 'undefined' ? SKILL_TREES : [];

function freshState() {
  return {
    v: 1,
    start: mondayOf(today()),
    logs: {},            // date -> { sets: {exId: [{v, w, done}]}, warm: {exId: true}, done: bool, mins }
    food: {},            // date -> [{id, mealId, name, kcal, p}]
    meals: DEFAULT_MEALS.map(m => ({ ...m })),
    weights: [],         // [{d, kg}]
    targets: { kcal: 2400, p: 130 },
    levels: {},          // skill tree key -> current step index
    focus: typeof DEFAULT_FOCUS !== 'undefined' ? [...DEFAULT_FOCUS] : [],
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...freshState(), ...JSON.parse(raw) };
  } catch (e) { /* storage unavailable: run in memory */ }
  return freshState();
}
let S = load();
// Add new built-in recipes to existing installs once (a deleted recipe stays deleted).
(function seedRecipes() {
  S.seeded = S.seeded || [];
  // Drop the old generic sample meals if they were never edited.
  const OLD = { m1: 'Greek yogurt, oats + berries', m2: 'Chicken, rice + veg', m3: '3 eggs + 2 toast', m5: 'Tuna wrap', m7: 'Salmon, potatoes + salad', m8: 'Cottage cheese + fruit' };
  S.meals = S.meals.filter(m => OLD[m.id] !== m.name);
  const fresh = RECIPES.filter(r => !S.seeded.includes(r.id) && !S.meals.some(m => m.id === r.id));
  if (fresh.length) S.meals = [...fresh.map(r => ({ ...r })), ...S.meals];
  RECIPES.forEach(r => { if (!S.seeded.includes(r.id)) S.seeded.push(r.id); });
  // Refresh built-in recipe details when they change (keeps the user's own meals untouched).
  if ((S.recipesV || 1) < RECIPES_VERSION) {
    S.meals = S.meals.map(m => { const r = RECIPES.find(x => x.id === m.id); return r ? { ...r } : m; });
    S.recipesV = RECIPES_VERSION;
  }
  // Built-in recipes first, in the order of the day.
  const order = id => { const i = RECIPES.findIndex(r => r.id === id); return i < 0 ? 99 : i; };
  S.meals = S.meals.map((m, i) => [m, i]).sort((a, b) => order(a[0].id) - order(b[0].id) || a[1] - b[1]).map(x => x[0]);
  save();
})();
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }

// Day photos live in their own keys so the main state stays small.
const photoKey = tone => `chalk.img.${tone}`;
function getPhoto(tone) { try { return localStorage.getItem(photoKey(tone)); } catch (e) { return null; } }

/* ================= program ================= */

// Which weekdays each skill family is trained on (0 = Sunday, light balance practice).
const FAMILY_DAYS = { push: [1, 4], pull: [2, 5], dynamic: [2, 5], balance: [3, 6, 0], core: [3, 6], legs: [3, 6] };
const FOCUS_MAX = typeof MAX_FOCUS !== 'undefined' ? MAX_FOCUS : 6;

function levelOf(tree) {
  const i = S.levels[tree.key];
  return Number.isInteger(i) ? Math.min(i, tree.steps.length - 1) : (tree.start || 0);
}

// Skill steps become exercises with id "sk_<stepId>" so they log and prefill like everything else.
function stepExercise(tree, idx) {
  const st = tree.steps[idx];
  const val = st.target.value;
  return {
    name: st.name,
    type: st.type === 'time' ? 'time' : 'reps',
    sets: Math.max(st.target.sets, typeof WORK_SETS !== 'undefined' ? WORK_SETS : 3),
    lo: Math.max(1, Math.round(val * (st.type === 'time' ? 0.5 : 0.6))),
    hi: val,
    rest: 150,
    cue: st.how,
    skill: tree.key,
    tree: tree.key,
    step: idx,
  };
}

function getEx(id) {
  if (EX[id]) return EX[id];
  if (id.startsWith('sk_')) {
    const stepId = id.slice(3);
    for (const t of TREES) {
      const i = t.steps.findIndex(s => s.id === stepId);
      if (i >= 0) return stepExercise(t, i);
    }
  }
  return { name: id, type: 'reps', sets: 3, lo: 8, hi: 12, rest: 90 };
}

// 4-week cycle: rotation A, B, C, then a deload week (A exercises, half the gym sets).
function weekInfo(date) {
  const w = Math.floor(daysBetween(S.start, mondayOf(date)) / 7);
  const cycle = ((w % 4) + 4) % 4;
  return { cycle, rot: cycle === 3 ? 0 : cycle, deload: cycle === 3 };
}
function weekIndex(date) { return weekInfo(date).rot; }
const weekName = date => weekInfo(date).deload ? 'Deload' : `Week ${ROT[weekIndex(date)]}`;
// Deload halves sets on everything except skill work and warm-ups.
const setCount = (date, ex) => weekInfo(date).deload && !ex.tree ? Math.ceil(ex.sets / 2) : ex.sets;

function planFor(date) {
  const dow = parse(date).getDay();
  const day = DAYS[dow];
  const wk = weekIndex(date);
  let slots = day.slots.slice();
  const injected = [];
  for (const t of TREES.filter(t => S.focus.includes(t.key) && (FAMILY_DAYS[t.family] || []).includes(dow))) {
    if (t.replaces) slots = slots.filter(sl => !sl.some(id => t.replaces.includes(id)));
    injected.push('sk_' + t.steps[levelOf(t)].id);
  }
  const ids = [...new Set([...injected, ...slots.map(sl => sl[wk % sl.length])])];
  return { dow, day, wk, ids, warm: WARMUPS[day.tone] || [] };
}

/* ================= workout log ================= */

function logFor(date, create) {
  if (!S.logs[date] && create) S.logs[date] = { sets: {}, warm: {}, done: false };
  return S.logs[date];
}

function lastPerf(exId, before) {
  const dates = Object.keys(S.logs).filter(d => d < before).sort().reverse();
  for (const d of dates) {
    const sets = S.logs[d].sets[exId];
    if (sets && sets.some(s => s.done)) return { date: d, sets: sets.filter(s => s.done) };
  }
  return null;
}

function setsFor(date, exId) {
  const lg = S.logs[date];
  if (lg && lg.sets[exId]) return lg.sets[exId];
  const ex = getEx(exId);
  const last = lastPerf(exId, date);
  const out = [];
  for (let i = 0; i < setCount(date, ex); i++) {
    const src = last ? (last.sets[i] || last.sets[last.sets.length - 1]) : null;
    out.push({ v: src ? src.v : ex.lo, w: src ? (src.w || 0) : 0, done: false });
  }
  return out;
}

function materialize(date, exId) {
  const lg = logFor(date, true);
  if (!lg.sets[exId]) lg.sets[exId] = setsFor(date, exId).map(s => ({ ...s }));
  return lg.sets[exId];
}

function recentPerfs(exId, before, n) {
  const out = [];
  for (const d of Object.keys(S.logs).filter(d => d < before).sort().reverse()) {
    const sets = (S.logs[d].sets[exId] || []).filter(s => s.done);
    if (sets.length) out.push(sets);
    if (out.length >= n) break;
  }
  return out;
}
// True when the last two sessions both hit `target` on at least `sets` sets.
function hitTwice(exId, before, sets, target) {
  const r = recentPerfs(exId, before, 2);
  return r.length === 2 && r.every(ss => ss.filter(s => s.v >= target).length >= sets);
}
function hint(ex, id, date) {
  if (!hitTwice(id, date, ex.sets, ex.hi)) return '';
  if (ex.tree) return 'Goal hit. Level up';
  if (ex.type === 'weight') return '+2.5 kg';
  if (ex.type === 'time') return '+5 s';
  return '+1 rep';
}

const fmtSet = (ex, s) => (ex.type === 'time' ? `${s.v}s` : `${s.v}`) + (ex.type === 'weight' && s.w ? `×${s.w}` : '');
const fmtTarget = ex => `${ex.sets}×${ex.lo === ex.hi ? ex.hi : `${ex.lo}–${ex.hi}`}${ex.type === 'time' ? 's' : ''}`;

function isTrainDay(date) { return parse(date).getDay() !== 0; }
function didTrain(date) {
  const lg = S.logs[date];
  return !!lg && (lg.done || Object.values(lg.sets).some(a => a.some(s => s.done)));
}
function estMinutes(ids) {
  let sec = 6 * 60;
  for (const id of ids) { const ex = getEx(id); sec += ex.sets * (40 + (ex.rest || 20)); }
  return Math.round(sec / 300) * 5;
}

/* ================= ui helpers ================= */

const ui = { tab: 'today', date: today(), foodDate: today(), editMeals: false, page: null, p: null, bw: null };

const TONE = { push: 'var(--accent)', pull: 'var(--accent)', legs: 'var(--accent)', mob: 'var(--accent)', rest: 'var(--dim)' };
const FAM_TONE = { push: 'var(--accent)', balance: 'var(--accent)', pull: 'var(--accent)', dynamic: 'var(--accent)', core: 'var(--accent)', legs: 'var(--accent)' };
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ROT = ['A', 'B', 'C'];

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const I = {
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z"/></svg>',
  left: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  flame: '<svg viewBox="0 0 24 24"><path d="M12 3c3.5 4 6 7.2 6 10.5A6 6 0 0 1 6 13.5C6 10.2 8.5 7 12 3z"/></svg>',
  bolt: '<svg viewBox="0 0 24 24"><path d="M13 3L5 14h6l-1 7 8-11h-6z"/></svg>',
  streak: '<svg viewBox="0 0 24 24"><path d="M4 18l5-6 4 3 7-9"/></svg>',
  scale: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M9 10a3 3 0 0 1 6 0"/></svg>',
  cam: '<svg viewBox="0 0 24 24"><path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
};

// SVG ring in a 100×100 box.
function ring(pct, sw = 7, color = 'var(--tone)', extra = '') {
  const r = 50 - sw / 2 - 1, c = 2 * Math.PI * r;
  return `<svg class="ring" viewBox="0 0 100 100" style="--rc:${color}" ${extra}><circle class="bg" cx="50" cy="50" r="${r}" stroke-width="${sw}"/>
    <circle class="fg" cx="50" cy="50" r="${r}" stroke-width="${sw}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - Math.max(0, Math.min(1, pct)))}"/></svg>`;
}
function setTone(t) { document.documentElement.style.setProperty('--tone', t); }
const dateLabel = d => d === today() ? 'Today' : d === addDays(today(), -1) ? 'Yesterday' : `${DOW[parse(d).getDay()]} ${parse(d).getDate()} ${MON[parse(d).getMonth()]}`;

/* ================= TODAY ================= */

function renderToday() {
  const date = ui.date;
  const plan = planFor(date);
  setTone(TONE[plan.day.tone]);
  const lg = S.logs[date];

  const mon = mondayOf(date);
  let week = '';
  for (let i = 0; i < 7; i++) {
    const ds = addDays(mon, i), dd = parse(ds);
    const cls = ['wd', ds === date && 'on', ds === today() && 'today', didTrain(ds) && 'done'].filter(Boolean).join(' ');
    week += `<button class="${cls}" style="--dc:${TONE[DAYS[dd.getDay()].tone]}" data-act="pick-day" data-date="${ds}"><b>${DOW[dd.getDay()][0]}</b><span>${dd.getDate()}</span><i></i></button>`;
  }

  let total = 0, done = 0;
  plan.ids.forEach(id => { const ss = setsFor(date, id); total += ss.length; done += ss.filter(s => s.done).length; });
  const finished = lg && lg.done;
  const cta = finished
    ? `<button class="cta ghost" data-act="play" data-i="0">${I.check} Completed · review</button>`
    : `<button class="cta go" data-act="play">${I.play} ${done ? `Continue · ${done}/${total}` : 'Start'}</button>`;

  const tot = foodTotals(today());
  const T = S.targets;
  const photo = getPhoto(plan.day.tone);

  const skills = plan.ids.filter(id => getEx(id).tree).map(id => {
    const ex = getEx(id), t = TREES.find(x => x.key === ex.tree);
    return `<button class="row link-row" data-act="skill" data-key="${t.key}">
      <span class="n"><b>${esc(shortName(t.name))}</b><br><span class="dim">${esc(ex.name)}</span></span>
      <span class="v">${ex.step + 1}/${t.steps.length}</span><span class="chev">${I.right}</span></button>`;
  }).join('');

  const steps = playerSteps(plan);
  const list = steps.map((id, i) => {
    if (id === '__warm') {
      const w = (lg && lg.warm) || {};
      const ok = plan.warm.every(x => w[x]);
      return `<li class="${ok ? 'done' : ''}"><button data-act="play" data-i="${i}"><span class="n">${ok ? '✓' : ''}</span><span class="nm">Warm-up</span><span class="tg">${plan.warm.length} moves</span></button></li>`;
    }
    const ex = getEx(id), ss = setsFor(date, id), ok = ss.every(s => s.done);
    const n = steps[0] === '__warm' ? i : i + 1;
    return `<li class="${ok ? 'done' : ''}"><button data-act="play" data-i="${i}"><span class="n">${ok ? '✓' : n}</span><span class="nm">${esc(ex.name)}</span><span class="tg">${fmtTarget(ex)}</span></button></li>`;
  }).join('');

  return `
    <div class="top"><span class="brand">Chalk</span><span class="label">${weekName(date)}</span></div>
    <nav class="week">${week}</nav>
    <section class="hero ${photo ? 'has-img' : ''}">
      ${photo ? `<div class="hero-img" style="background-image:url(${photo})"></div>` : ''}
      <label class="hero-cam" aria-label="Set photo">${I.cam}<input type="file" accept="image/*" data-act="hero-photo" data-tone="${plan.day.tone}" hidden></label>
      <span class="chip">${date === today() ? 'Today' : DOW[parse(date).getDay()]}</span>
      <div>
        <h1 class="title">${esc(plan.day.title)}</h1>
        <div class="sub">${estMinutes(plan.ids)} min · ${esc(plan.day.sub)}</div>
        ${done && !finished ? `<div class="hero-bar"><span style="width:${(done / total) * 100}%"></span></div>` : ''}
        ${cta}
      </div>
    </section>
    ${skills ? `<div class="sect"><span class="label">Today's skill</span></div><div class="rows">${skills}</div>` : ''}
    <div class="grid2">
      <button class="tile" data-act="tab" data-tab="fuel"><span class="label">Calories left</span><div class="num">${T.kcal - tot.kcal}</div></button>
      <button class="tile" data-act="tab" data-tab="fuel"><span class="label">Protein left</span><div class="num">${Math.max(0, T.p - tot.p)}<small>g</small></div></button>
    </div>
    <div class="sect"><span class="label">Session</span><span class="label">Next: ${weekName(addDays(date, 7))}</span></div>
    <ul class="plan rows">${list}</ul>`;
}

function shortName(n) {
  return n.replace(/\s*\(.*\)/, '').replace('Press to handstand and one-arm handstand', 'Press + OAHS')
    .replace(' to German hang and maltese prep', '').replace('Handstand push-up', 'HSPU');
}

/* ================= PLAYER (one exercise at a time) ================= */

function playerSteps(plan) { return (plan.warm.length ? ['__warm'] : []).concat(plan.ids); }

function openPlayer(date, i) {
  const plan = planFor(date);
  const steps = playerSteps(plan);
  if (i == null) { // first unfinished step
    const w = (S.logs[date] || {}).warm || {};
    i = steps.findIndex(id => id === '__warm' ? !plan.warm.every(x => w[x]) : setsFor(date, id).some(s => !s.done));
    if (i < 0) i = 0;
  }
  ui.p = { date, plan, steps, i, rest: null, finished: false, started: Date.now() };
  document.body.classList.add('locked');
  renderOverlay(true);
}
function closePlayer() { ui.p = null; stopRest(); document.body.classList.remove('locked'); renderOverlay(); quiet(); }

function curSet(sets) { const c = sets.findIndex(s => !s.done); return c < 0 ? sets.length : c; }

function renderPlayer() {
  const p = ui.p;
  setTone(TONE[p.plan.day.tone]);
  const segs = p.steps.map((id, i) => {
    let frac;
    if (id === '__warm') { const w = (S.logs[p.date] || {}).warm || {}; frac = p.plan.warm.filter(x => w[x]).length / p.plan.warm.length; }
    else { const ss = setsFor(p.date, id); frac = ss.filter(s => s.done).length / ss.length; }
    return `<i class="${frac >= 1 ? 'done' : i === p.i ? 'cur' : ''}" style="--p:${frac * 100}%"></i>`;
  }).join('');
  const exCount = p.steps.filter(x => x !== '__warm').length;
  const pos = p.steps[0] === '__warm' ? p.i : p.i + 1;

  let main, foot;
  if (p.finished) [main, foot] = playerFinish();
  else if (p.rest) [main, foot] = playerRest();
  else if (p.steps[p.i] === '__warm') [main, foot] = playerWarm();
  else [main, foot] = playerExercise();

  return `<div class="player">
    <div class="segs">${segs}</div>
    <div class="p-top"><button class="icon-btn" data-act="close-player" aria-label="Close">${I.close}</button>
      <span class="label">${p.finished ? 'Done' : p.steps[p.i] === '__warm' ? 'Warm-up' : `${pos} / ${exCount}`}</span>
      <span style="width:40px"></span></div>
    <div class="p-main">${main}</div>
    <div class="p-foot">${foot}</div>
  </div>`;
}

function navFoot(center) {
  const p = ui.p;
  return `<button class="side" data-act="p-prev" ${p.i === 0 ? 'disabled' : ''} aria-label="Previous">${I.left}</button>${center}
    <button class="side" data-act="p-next" ${p.i >= p.steps.length - 1 ? 'disabled' : ''} aria-label="Next">${I.right}</button>`;
}

function playerWarm() {
  const p = ui.p, w = (S.logs[p.date] || {}).warm || {};
  const rows = p.plan.warm.map(id => {
    const ex = EX[id];
    return `<button class="${w[id] ? 'on' : ''}" data-act="warm" data-id="${id}"><span class="ck">${I.check}</span><span class="t">${esc(ex.name)}</span><span class="g">${fmtTarget(ex)}</span></button>`;
  }).join('');
  return [`<h2 class="p-name">Warm-up</h2><p class="p-cue">Loosen up. Slow and controlled.</p><div class="wu">${rows}</div>`,
    navFoot(`<button class="orb" data-act="p-next">Begin ${I.right}</button>`)];
}

function playerExercise() {
  const p = ui.p, id = p.steps[p.i], ex = getEx(id);
  const sets = setsFor(p.date, id), c = curSet(sets);
  const last = lastPerf(id, p.date), h = hint(ex, id, p.date);
  const dots = sets.map((s, i) => `<i class="${s.done ? 'done' : i === c ? 'cur' : ''}"></i>`).join('');
  if (c >= sets.length) {
    return [`<h2 class="p-name">${esc(ex.name)}</h2><div class="p-dots">${dots}</div><p class="p-cue">All sets done</p>
      <div class="rest-act"><button data-act="add-set" data-id="${id}">+ One more set</button></div>`,
      navFoot(`<button class="orb" data-act="p-next">${p.i >= p.steps.length - 1 ? 'Finish' : 'Next'} ${I.right}</button>`)];
  }
  const s = sets[c];
  const unit = ex.type === 'time' ? 'seconds' : 'reps';
  const kg = ex.type === 'weight' ? `<div class="p-kg"><button class="adj" data-act="dec" data-f="w">−</button>
      <input type="number" inputmode="decimal" value="${s.w}" data-act="p-input" data-f="w" aria-label="Weight"><span>kg</span>
      <button class="adj" data-act="inc" data-f="w">+</button></div>` : '';
  return [`
    ${ex.tree ? '<span class="label">Skill · quality over reps</span>' : ex.type === 'weight' ? '<span class="label">Muscle · last 2 reps hard</span>' : ''}
    <h2 class="p-name">${esc(ex.name)}</h2>
    <p class="p-cue">${ex.cue ? esc(ex.cue) : `Target ${fmtTarget(ex)}`}</p>
    <div class="p-dots">${dots}</div>
    <div class="p-val"><button class="adj" data-act="dec" data-f="v">−</button>
      <input type="number" inputmode="numeric" value="${s.v}" data-act="p-input" data-f="v" aria-label="${unit}">
      <button class="adj" data-act="inc" data-f="v">+</button></div>
    <div class="p-unit">${unit} · set ${c + 1} of ${sets.length}</div>
    ${kg}
    <div class="p-last">${last ? `Last ${last.sets.map(x => fmtSet(ex, x)).join(' · ')}${h ? ` · <b>${h}</b>` : ''}` : `Target ${fmtTarget(ex)}`}</div>`,
    navFoot(`<button class="orb" data-act="set-done">${I.check} Done</button>`)];
}

function playerRest() {
  const r = ui.p.rest;
  const left = Math.max(0, Math.ceil((r.end - Date.now()) / 1000));
  return [`
    <div class="breath"><div class="glow"></div><div class="rim"></div>
      ${ring(left / r.total, 1.2, 'var(--text)', 'id="rest-ring"')}
      <div class="mid"><div class="num" id="rest-num">${fmtClock(left)}</div><div class="label" id="rest-breath">${breathWord()}</div></div>
    </div>
    <div class="rest-next">Next · <b>${esc(r.next)}</b></div>
    <div class="rest-act"><button data-act="rest-add">+15 s</button><button data-act="rest-skip">Skip</button></div>`,
    `<span style="flex:1"></span>`];
}

function playerFinish() {
  const p = ui.p;
  let sets = 0, vol = 0;
  for (const id of p.plan.ids) for (const s of setsFor(p.date, id)) if (s.done) { sets++; if (s.w) vol += s.w * s.v; }
  const mins = Math.max(1, Math.round((Date.now() - p.started) / 60000));
  return [`<h2 class="p-name">Session done</h2><p class="p-cue">Eat, hydrate, sleep well.</p>
    <div class="finish-stats"><div><b>${sets}</b><span>Sets</span></div><div><b>${mins}</b><span>Min</span></div><div><b>${vol >= 1000 ? (vol / 1000).toFixed(1) + 't' : Math.round(vol)}</b><span>${vol >= 1000 ? 'Volume' : 'Kg moved'}</span></div></div>`,
    `<button class="orb" data-act="finish">Save session</button>`];
}

const fmtClock = s => s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `${s}`;
const breathWord = () => (Math.floor(performance.now() / 4000) % 2 === 0 ? 'Breathe in' : 'Breathe out');

let restIv = null;
function startRest(sec, next, advance) {
  if (!sec) { if (advance) ui.p.i++; renderOverlay(true); return; }
  ui.p.rest = { end: Date.now() + sec * 1000, total: sec, next, advance };
  renderOverlay();
  clearInterval(restIv);
  restIv = setInterval(restTick, 250);
}
function restTick() {
  const r = ui.p && ui.p.rest;
  if (!r) return stopRest();
  const left = Math.max(0, Math.ceil((r.end - Date.now()) / 1000));
  const num = $('#rest-num'); if (num) num.textContent = fmtClock(left);
  const br = $('#rest-breath'); if (br) br.textContent = breathWord();
  const fg = $('#rest-ring .fg');
  if (fg) { const c = +fg.getAttribute('stroke-dasharray'); fg.setAttribute('stroke-dashoffset', c * (1 - left / r.total)); }
  if (left <= 0) endRest(true);
}
function endRest(buzz) {
  const r = ui.p.rest; stopRest();
  if (r && r.advance) ui.p.i++;
  ui.p.rest = null;
  if (buzz) try { navigator.vibrate && navigator.vibrate([180, 90, 180]); } catch (e) { /* noop */ }
  renderOverlay(true);
}
function stopRest() { clearInterval(restIv); restIv = null; }

function setDone() {
  const p = ui.p, id = p.steps[p.i], ex = getEx(id);
  const sets = materialize(p.date, id), c = curSet(sets);
  if (c >= sets.length) return;
  sets[c].done = true; save();
  if (c + 1 < sets.length) return startRest(ex.rest, `Set ${c + 2} of ${sets.length}`, false);
  if (p.i < p.steps.length - 1) return startRest(Math.min(ex.rest, 90), getEx(p.steps[p.i + 1]).name, true);
  p.finished = true; renderOverlay(true);
}

/* ================= FUEL ================= */

function foodTotals(date) {
  return (S.food[date] || []).reduce((a, f) => ({ kcal: a.kcal + (+f.kcal || 0), p: a.p + (+f.p || 0) }), { kcal: 0, p: 0 });
}

function renderFuel() {
  setTone('var(--accent)');
  const date = ui.foodDate, tot = foodTotals(date), T = S.targets;
  const left = T.kcal - tot.kcal, over = left < 0;
  const list = S.food[date] || [];
  const counts = {};
  list.forEach(f => { if (f.mealId) counts[f.mealId] = (counts[f.mealId] || 0) + 1; });

  const rO = 46, rI = 36, cO = 2 * Math.PI * rO, cI = 2 * Math.PI * rI;
  const score = `<div class="score ${over ? 'over' : ''}">
    <svg class="ring" viewBox="0 0 100 100">
      <circle class="bg" cx="50" cy="50" r="${rO}" stroke-width="4"/>
      <circle class="fg" cx="50" cy="50" r="${rO}" stroke-width="4" style="--rc:${over ? 'var(--danger)' : 'var(--text)'}" stroke-dasharray="${cO}" stroke-dashoffset="${cO * (1 - Math.min(1, tot.kcal / T.kcal))}"/>
      <circle class="bg" cx="50" cy="50" r="${rI}" stroke-width="3"/>
      <circle class="fg" cx="50" cy="50" r="${rI}" stroke-width="3" style="--rc:var(--accent)" stroke-dasharray="${cI}" stroke-dashoffset="${cI * (1 - Math.min(1, tot.p / T.p))}"/>
    </svg>
    <div class="mid"><div class="num">${Math.abs(left)}</div><div class="label">${over ? 'kcal over' : 'kcal left'}</div></div></div>`;

  const tiles = S.meals.map(m => `<button class="meal" data-act="${ui.editMeals ? 'edit-meal' : 'log-meal'}" data-id="${m.id}">
      ${counts[m.id] ? `<span class="cnt">${counts[m.id]}</span>` : ''}<span class="nm">${esc(m.name)}</span>${m.items ? `<span class="ing">${m.items.map(esc).join(' · ')}</span>` : ''}
      <span class="mac">${m.kcal} · <b>${m.p}g</b></span></button>`).join('');

  const yday = S.food[addDays(date, -1)] || [];
  const rows = list.length ? list.slice().reverse().map(f => `<div class="row"><span class="n">${esc(f.name)}</span><span class="v">${f.kcal} · ${f.p}g</span>
      <button class="x" data-act="rm-food" data-id="${f.id}" aria-label="Remove">×</button></div>`).join('')
    : `<div class="empty">Tap a meal to log it</div>`;

  return `
    <div class="top"><span class="label"></span>
      <div class="daynav"><button class="icon-btn" data-act="food-prev" aria-label="Previous day">${I.left}</button>
        <span class="label" style="min-width:76px;text-align:center">${dateLabel(date)}</span>
        <button class="icon-btn" data-act="food-next" aria-label="Next day" ${date >= today() ? 'style="opacity:.25"' : ''}>${I.right}</button></div></div>
    <h1 class="title">Food</h1>
    ${score}
    <div class="score-sub"><div><i style="background:var(--text)"></i><b>${tot.kcal}</b> / ${T.kcal} kcal</div><div><i style="background:var(--accent)"></i><b>${tot.p}</b> / ${T.p} g protein</div></div>
    <div class="sect"><span class="label">Tap to log</span><button class="link ${ui.editMeals ? '' : 'dim'}" data-act="toggle-edit">${ui.editMeals ? 'Done' : 'Edit'}</button></div>
    <div class="meals ${ui.editMeals ? 'editing' : ''}">${tiles}<button class="meal add" data-act="new-meal">+ New</button></div>
    ${!list.length && S.meals.some(m => m.day) ? `<button class="cta ghost" style="margin-top:12px" data-act="log-day">Log my usual day</button>` : ''}
    <div class="sect"><span class="label">Logged</span>${!list.length && yday.length ? `<button class="link" data-act="copy-yday">Copy yesterday</button>` : `<button class="link dim" data-act="quick-add">One-off</button>`}</div>
    <div class="rows">${rows}</div>`;
}

function logMeal(m, date) {
  const entry = { id: uid(), mealId: m.id, name: m.name, kcal: +m.kcal, p: +m.p };
  (S.food[date] = S.food[date] || []).push(entry);
  save();
  return entry;
}

/* ================= SKILLS ================= */

function skillReady(t) {
  const lvl = levelOf(t), cur = t.steps[lvl];
  if (lvl >= t.steps.length - 1) return false;
  return hitTwice('sk_' + cur.id, addDays(today(), 1), cur.target.sets, cur.target.value);
}

function renderSkills() {
  setTone('var(--accent)');
  const row = t => {
    const l = levelOf(t);
    return `<button class="row link-row skill-row" data-act="skill" data-key="${t.key}">
      <span class="n"><b>${esc(shortName(t.name))}</b><br><span class="dim">${esc(t.steps[l].name)}</span></span>
      ${skillReady(t) ? '<span class="badge">Ready</span>' : ''}
      <span class="lvl"><span class="v">${l + 1}/${t.steps.length}</span><span class="bar"><i style="width:${(l + 1) / t.steps.length * 100}%"></i></span></span>
      <span class="chev">${I.right}</span></button>`;
  };
  const focus = TREES.filter(t => S.focus.includes(t.key)), rest = TREES.filter(t => !S.focus.includes(t.key));
  return `<div class="top"><span class="label">Skills</span></div>
    <h1 class="title">Skills</h1>
    <div class="sect"><span class="label">Training now</span><span class="label">${focus.length}/${FOCUS_MAX}</span></div>
    <div class="rows">${focus.map(row).join('')}</div>
    <div class="sect"><span class="label">Other skills</span></div>
    <div class="rows">${rest.map(row).join('')}</div>
    <div class="rows" style="margin-top:24px"><button class="row link-row" data-act="guide"><span class="n">Athlete guide</span><span class="chev">${I.right}</span></button></div>`;
}

function renderSkillPage(key) {
  const t = TREES.find(x => x.key === key);
  const l = levelOf(t), col = FAM_TONE[t.family], cur = t.steps[l], focus = S.focus.includes(t.key);
  const ready = skillReady(t);
  const ladder = t.steps.map((s, i) => `<li class="rung ${i < l ? 'passed' : i === l ? 'current' : 'locked'}">
      <span class="dot">${i < l ? I.check : i + 1}</span><span class="t"><b>${esc(s.name)}</b><span>${esc(s.goal)}</span></span></li>`).join('');
  return `<div class="page" style="--rc:var(--accent)"><div class="page-in">
    <div class="top"><button class="icon-btn" data-act="close-page" aria-label="Back">${I.left}</button><span class="label">${esc(t.family[0].toUpperCase() + t.family.slice(1))}</span></div>
    <h1>${esc(shortName(t.name))}</h1>
    <div class="big-score"><span class="num">${l + 1}</span><span class="of">/ ${t.steps.length}</span></div>
    <section class="card">
      <div class="goal-card"><div><div class="label">Now</div><div style="font-weight:700;font-size:17px;margin-top:4px">${esc(cur.name)}</div></div>
        <div class="num">${cur.target.sets}×${cur.target.value}${cur.type === 'time' ? '<small style="font-size:16px;color:var(--dim)">s</small>' : ''}</div></div>
      <div class="drills"><p>${esc(cur.how)}</p>${cur.drills && cur.drills.length ? `<ul>${cur.drills.map(d => `<li>${esc(d)}</li>`).join('')}</ul>` : ''}</div>
      <div class="btn-row">
        ${l < t.steps.length - 1 ? `<button class="cta ${ready ? '' : 'ghost'}" data-act="level" data-key="${t.key}" data-d="1">Level up</button>` : ''}
        <button class="cta ${focus ? 'ghost' : ''}" data-act="focus" data-key="${t.key}">${focus ? 'Unfocus' : 'Focus'}</button>
      </div>
    </section>
    <section class="card"><div class="card-head"><span class="label">Path</span>${l > 0 ? `<button class="link dim" data-act="level" data-key="${t.key}" data-d="-1">Step back</button>` : ''}</div><ol class="ladder">${ladder}</ol></section>
  </div></div>`;
}

function renderGuidePage() {
  const G = typeof ATHLETE_GUIDE !== 'undefined' ? ATHLETE_GUIDE : {};
  const sec = (title, arr) => !arr || !arr.length ? '' : `<div class="sect"><span class="label">${title}</span></div>` +
    arr.map(c => `<article class="card guide-card" style="margin-top:8px"><h3>${esc(c.title)}</h3><p>${esc(c.body)}</p></article>`).join('');
  return `<div class="page"><div class="page-in">
    <div class="top"><button class="icon-btn" data-act="close-page" aria-label="Back">${I.left}</button><span></span></div>
    <h1>Guide</h1>
    ${sec('Training', G.training)}${sec('Posture', G.posture)}${sec('Nutrition', G.nutrition)}${sec('Recovery', G.recovery)}
  </div></div>`;
}

/* ================= ME ================= */

function sortedWeights() { return S.weights.slice().sort((a, b) => a.d < b.d ? -1 : 1); }
// Weeks in a row with 6+ sessions. The current week can only add to the streak, never break it.
function sessionsInWeek(mon) { let n = 0; for (let i = 0; i < 7; i++) if (didTrain(addDays(mon, i))) n++; return n; }
function streak() {
  const thisMon = mondayOf(today());
  let n = sessionsInWeek(thisMon) >= 6 ? 1 : 0;
  for (let mon = addDays(thisMon, -7), k = 0; k < 104; k++, mon = addDays(mon, -7)) {
    if (sessionsInWeek(mon) >= 6) n++; else break;
  }
  return n;
}

function renderMe() {
  setTone('var(--accent)');
  const t = today(), mon = mondayOf(t);
  let weekDone = 0;
  for (let i = 0; i < 7; i++) if (didTrain(addDays(mon, i))) weekDone++;
  let nDays = 0, kSum = 0, pSum = 0;
  for (let i = 1; i <= 7; i++) { const d = addDays(t, -i); if ((S.food[d] || []).length) { const x = foodTotals(d); nDays++; kSum += x.kcal; pSum += x.p; } }

  const ws = sortedWeights();
  const todayW = ws.find(w => w.d === t);
  if (ui.bw == null) ui.bw = todayW ? todayW.kg : ws.length ? ws[ws.length - 1].kg : 63;
  const delta = ws.length > 1 ? Math.round((ws[ws.length - 1].kg - ws[0].kg) * 10) / 10 : null;

  const best = {};
  for (const d of Object.keys(S.logs)) for (const [id, sets] of Object.entries(S.logs[d].sets)) {
    if (!getEx(id).skill) continue;
    for (const s of sets) if (s.done) {
      const b = best[id] = best[id] || { v: 0, d, hist: {} };
      if (s.v >= b.v) { b.v = s.v; b.d = d; }
      b.hist[d] = Math.max(b.hist[d] || 0, s.v);
    }
  }
  const pbs = Object.entries(best).sort((a, b) => b[1].d.localeCompare(a[1].d)).map(([id, b]) => {
    const ex = getEx(id), hist = Object.keys(b.hist).sort().slice(-10).map(d => b.hist[d]), mx = Math.max(...hist, 1);
    return `<div class="pb"><span class="n">${esc(ex.name)}</span><span class="bars">${hist.map(v => `<span class="${v === b.v ? 'hi' : ''}" style="height:${Math.max(10, v / mx * 100)}%"></span>`).join('')}</span>
      <span class="v">${b.v}<small>${ex.type === 'time' ? 's' : ''}</small></span></div>`;
  }).join('');

  return `
    <div class="top"><span class="label">${weekName(t)}</span></div><h1 class="title">Me</h1>
    <section class="card" style="margin-top:0">
      <div class="card-head"><span class="label">Bodyweight</span><span class="label">${delta != null ? `${delta > 0 ? '+' : ''}${delta} kg` : ''}</span></div>
      <div class="bw-num"><span class="num">${ui.bw.toFixed(1)}</span><span>kg</span></div>
      <div class="stepper"><button class="adj" data-act="bw" data-d="-0.1" aria-label="Less">−</button>
        <button class="cta" data-act="bw-save">${todayW ? 'Update' : 'Log today'}</button>
        <button class="adj" data-act="bw" data-d="0.1" aria-label="More">+</button></div>
      ${spark(ws.slice(-30).map(w => w.kg))}
    </section>
    <div class="grid2">
      <div class="tile"><span class="label">This week</span><div class="num">${weekDone}<small>/ 7</small></div></div>
      <div class="tile"><span class="label">Weeks in a row</span><div class="num">${streak()}</div></div>
      <div class="tile"><span class="label">Avg protein</span><div class="num">${nDays ? Math.round(pSum / nDays) : '–'}<small>g</small></div></div>
      <div class="tile"><span class="label">Avg kcal</span><div class="num">${nDays ? Math.round(kSum / nDays) : '–'}</div></div>
    </div>
    ${pbs ? `<section class="card"><div class="card-head"><span class="label">Skill bests</span></div>${pbs}</section>` : ''}
    <div class="rows" style="margin-top:10px"><button class="row link-row" data-act="guide"><span class="n">Athlete guide</span><span class="chev">${I.right}</span></button></div>
    <section class="card">
      <div class="card-head"><span class="label">This week</span></div>
      <div class="seg" style="grid-template-columns:repeat(4,1fr)">${[...ROT, 'Deload'].map((r, i) => `<button class="${weekInfo(t).cycle === i ? 'on' : ''}" data-act="rot" data-i="${i}">${r}</button>`).join('')}</div>
      <div style="margin-top:8px">
        <label class="field-row"><span>Daily kcal</span><input type="number" inputmode="numeric" value="${S.targets.kcal}" data-act="target" data-k="kcal"></label>
        <label class="field-row"><span>Protein (g)</span><input type="number" inputmode="numeric" value="${S.targets.p}" data-act="target" data-k="p"></label>
        <div class="field-row"><span>Backup</span><span style="display:flex;gap:14px"><button class="link" data-act="export">Save</button>
          <label class="link" style="cursor:pointer">Restore<input type="file" accept="application/json" data-act="import" hidden></label></span></div>
      </div>
    </section>`;
}

function spark(vals) {
  if (vals.length < 2) return '';
  const w = 300, h = 70, pad = 4, mn = Math.min(...vals) - .3, mx = Math.max(...vals) + .3;
  const pts = vals.map((v, i) => [pad + i / (vals.length - 1) * (w - 2 * pad), pad + (1 - (v - mn) / (mx - mn)) * (h - 2 * pad)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('');
  const L = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
    <path class="area" d="${line}L${L[0]},${h}L${pts[0][0]},${h}Z"/><path d="${line}"/><circle cx="${L[0]}" cy="${L[1]}" r="3"/></svg>`;
}

/* ================= photos ================= */

// Resize to max 1100px JPEG so a phone photo fits comfortably in local storage.
function storePhoto(file, tone) {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    const scale = Math.min(1, 1100 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    try { localStorage.setItem(photoKey(tone), c.toDataURL('image/jpeg', .8)); quiet(); toast('Photo set'); }
    catch (e) { toast('Photo too large'); }
  };
  img.src = url;
}

/* ================= sheet + toast ================= */

function openSheet(html) {
  $('#sheet-root').innerHTML = `<div class="scrim" data-act="close-sheet"></div><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
}
function closeSheet() { $('#sheet-root').innerHTML = ''; }

function mealSheet(m, mode) {
  openSheet(`<h2>${mode === 'edit' ? 'Edit meal' : mode === 'quick' ? 'One-off' : 'New meal'}</h2>
    <form data-form="meal" data-mode="${mode}" data-id="${m ? m.id : ''}">
      <label class="field"><span>Name</span><input type="text" name="name" required value="${m ? esc(m.name) : ''}" placeholder="Chicken wrap"></label>
      <div class="two">
        <label class="field"><span>Kcal</span><input type="number" inputmode="numeric" name="kcal" required value="${m ? m.kcal : ''}"></label>
        <label class="field"><span>Protein g</span><input type="number" inputmode="numeric" name="p" required value="${m ? m.p : ''}"></label>
      </div>
      ${m && m.items ? `<p class="label" style="margin:14px 0 0;line-height:1.5">${m.items.map(esc).join(' · ')}</p>` : ''}
      ${mode === 'new' ? `<label class="check-row"><input type="checkbox" name="log" checked> Log it now</label>` : ''}
      <div class="btn-row"><button class="cta" type="submit">${mode === 'quick' ? 'Log' : 'Save'}</button>
        ${mode === 'edit' ? `<button class="cta danger" type="button" data-act="del-meal" data-id="${m.id}">Delete</button>` : ''}</div>
    </form>`);
}

let toastT;
function toast(msg, action, fn) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span><button>${action || ''}</button>`;
  el.classList.add('on');
  $('button', el).onclick = () => { fn && fn(); el.classList.remove('on'); };
  clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 3000);
}

/* ================= render + events ================= */

function render(anim) {
  const v = $('#view');
  v.classList.toggle('anim', !!anim);
  v.innerHTML = ui.tab === 'today' ? renderToday() : ui.tab === 'fuel' ? renderFuel() : ui.tab === 'skills' ? renderSkills() : renderMe();
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('on', b.dataset.tab === ui.tab));
}
function renderOverlay(anim) {
  const o = $('#overlay');
  o.classList.toggle('anim', !!anim);
  o.innerHTML = ui.p ? renderPlayer() : ui.page === 'guide' ? renderGuidePage() : ui.page ? renderSkillPage(ui.page) : '';
}
// Re-render in place without replaying entrance animations.
function quiet() { render(false); if (ui.p || ui.page) renderOverlay(false); }
function openPage(p) { ui.page = p; document.body.classList.add('locked'); renderOverlay(true); }
function closePage() { ui.page = null; document.body.classList.remove('locked'); renderOverlay(); quiet(); }

function adjust(field, dir) {
  const p = ui.p, id = p.steps[p.i], ex = getEx(id);
  const sets = materialize(p.date, id), c = curSet(sets);
  if (c >= sets.length) return;
  const step = field === 'w' ? 2.5 : ex.type === 'time' ? 5 : 1;
  const nv = Math.max(0, Math.round(((+sets[c][field] || 0) + step * dir) * 100) / 100);
  for (let k = c; k < sets.length; k++) if (!sets[k].done) sets[k][field] = nv; // carry forward
  save();
  const inp = $(`.player input[data-f="${field}"]`); if (inp) inp.value = nv;
}

document.addEventListener('click', e => {
  const tab = e.target.closest('.tab');
  if (tab) { ui.tab = tab.dataset.tab; ui.bw = null; ui.editMeals = false; render(true); window.scrollTo(0, 0); return; }
  const el = e.target.closest('[data-act]');
  if (!el || el.tagName === 'INPUT') return;
  const a = el.dataset.act, id = el.dataset.id;

  switch (a) {
    case 'tab': ui.tab = el.dataset.tab; render(true); window.scrollTo(0, 0); break;
    case 'pick-day': ui.date = el.dataset.date; quiet(); break;

    // player
    case 'play': openPlayer(ui.date, el.dataset.i != null ? +el.dataset.i : null); break;
    case 'close-player': closePlayer(); break;
    case 'p-prev': if (ui.p.i > 0) { stopRest(); ui.p.rest = null; ui.p.i--; ui.p.finished = false; renderOverlay(true); } break;
    case 'p-next':
      stopRest(); ui.p.rest = null;
      if (ui.p.i < ui.p.steps.length - 1) ui.p.i++; else ui.p.finished = true;
      renderOverlay(true);
      break;
    case 'set-done': setDone(); break;
    case 'inc': adjust(el.dataset.f, 1); break;
    case 'dec': adjust(el.dataset.f, -1); break;
    case 'add-set': { const sets = materialize(ui.p.date, id); const l = sets[sets.length - 1]; sets.push({ v: l.v, w: l.w, done: false }); save(); renderOverlay(); break; }
    case 'warm': { const lg = logFor(ui.p.date, true); lg.warm = lg.warm || {}; lg.warm[id] = !lg.warm[id]; save(); renderOverlay(); break; }
    case 'rest-add': ui.p.rest.end += 15000; ui.p.rest.total += 15; restTick(); break;
    case 'rest-skip': endRest(false); break;
    case 'finish': {
      const lg = logFor(ui.p.date, true); lg.done = true; lg.mins = Math.round((Date.now() - ui.p.started) / 60000); save();
      closePlayer(); toast('Session saved');
      break;
    }

    // fuel
    case 'log-meal': {
      const m = S.meals.find(x => x.id === id); if (!m) break;
      const entry = logMeal(m, ui.foodDate); quiet();
      const tile = document.querySelector(`.meal[data-id="${id}"]`); if (tile) { tile.classList.add('flash'); setTimeout(() => tile.classList.remove('flash'), 400); }
      toast(m.name, 'Undo', () => { S.food[ui.foodDate] = S.food[ui.foodDate].filter(f => f.id !== entry.id); save(); quiet(); });
      break;
    }
    case 'rm-food': {
      const list = S.food[ui.foodDate] || [], idx = list.findIndex(f => f.id === id); if (idx < 0) break;
      const [gone] = list.splice(idx, 1); save(); quiet();
      toast('Removed', 'Undo', () => { list.splice(idx, 0, gone); save(); quiet(); });
      break;
    }
    case 'log-day': {
      const added = [];
      S.meals.filter(m => m.day).forEach(m => { for (let k = 0; k < (+m.day || 1); k++) added.push(logMeal(m, ui.foodDate)); });
      quiet();
      toast(`Logged ${added.length} items`, 'Undo', () => { const ids = added.map(x => x.id); S.food[ui.foodDate] = S.food[ui.foodDate].filter(f => !ids.includes(f.id)); save(); quiet(); });
      break;
    }
    case 'copy-yday': {
      const y = S.food[addDays(ui.foodDate, -1)] || [];
      S.food[ui.foodDate] = y.map(f => ({ ...f, id: uid() })); save(); quiet();
      toast(`Copied ${y.length}`, 'Undo', () => { S.food[ui.foodDate] = []; save(); quiet(); });
      break;
    }
    case 'food-prev': ui.foodDate = addDays(ui.foodDate, -1); quiet(); break;
    case 'food-next': if (ui.foodDate < today()) { ui.foodDate = addDays(ui.foodDate, 1); quiet(); } break;
    case 'toggle-edit': ui.editMeals = !ui.editMeals; quiet(); break;
    case 'new-meal': mealSheet(null, 'new'); break;
    case 'quick-add': mealSheet(null, 'quick'); break;
    case 'edit-meal': mealSheet(S.meals.find(x => x.id === id), 'edit'); break;
    case 'del-meal': S.meals = S.meals.filter(x => x.id !== id); save(); closeSheet(); quiet(); break;
    case 'close-sheet': closeSheet(); break;

    // skills
    case 'skill': openPage(el.dataset.key); break;
    case 'guide': openPage('guide'); break;
    case 'close-page': closePage(); break;
    case 'focus': {
      const k = el.dataset.key;
      if (S.focus.includes(k)) S.focus = S.focus.filter(x => x !== k);
      else if (S.focus.length >= FOCUS_MAX) { toast(`Max ${FOCUS_MAX} focus skills`); break; }
      else S.focus.push(k);
      save(); quiet(); break;
    }
    case 'level': {
      const t = TREES.find(x => x.key === el.dataset.key);
      const nv = Math.max(0, Math.min(t.steps.length - 1, levelOf(t) + +el.dataset.d));
      S.levels[t.key] = nv; save(); quiet();
      if (+el.dataset.d > 0) toast(t.steps[nv].name);
      break;
    }

    // me
    case 'bw': ui.bw = Math.max(30, Math.round((ui.bw + +el.dataset.d) * 10) / 10); quiet(); break;
    case 'bw-save': {
      const t = today();
      S.weights = S.weights.filter(w => w.d !== t); S.weights.push({ d: t, kg: ui.bw }); save(); quiet();
      toast(`${ui.bw.toFixed(1)} kg`);
      break;
    }
    case 'rot': {
      const shift = ((+el.dataset.i - weekInfo(today()).cycle) % 4 + 4) % 4;
      S.start = addDays(S.start, -7 * shift); save(); quiet(); break;
    }
    case 'export': {
      const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
      const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `chalk-backup-${today()}.json`; link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      break;
    }
  }
});

document.addEventListener('change', e => {
  const el = e.target, a = el.dataset.act;
  if (a === 'p-input') {
    const p = ui.p, sets = materialize(p.date, p.steps[p.i]), c = curSet(sets);
    const v = Math.max(0, parseFloat(String(el.value).replace(',', '.')) || 0);
    for (let k = c; k < sets.length; k++) if (!sets[k].done) sets[k][el.dataset.f] = v;
    save();
  } else if (a === 'hero-photo' && el.files[0]) {
    storePhoto(el.files[0], el.dataset.tone);
  } else if (a === 'target') {
    const v = parseInt(el.value, 10); if (v > 0) { S.targets[el.dataset.k] = v; save(); toast('Saved'); }
  } else if (a === 'import' && el.files[0]) {
    el.files[0].text().then(txt => {
      try { const d = JSON.parse(txt); if (!d.logs || !d.meals) throw 0; S = { ...freshState(), ...d }; save(); render(); toast('Restored'); }
      catch (err) { toast('Not a Chalk backup'); }
    });
  }
});

document.addEventListener('submit', e => {
  const f = e.target; if (f.dataset.form !== 'meal') return;
  e.preventDefault();
  const fd = new FormData(f);
  const m = { name: String(fd.get('name')).trim(), kcal: Math.round(+fd.get('kcal') || 0), p: Math.round(+fd.get('p') || 0) };
  if (!m.name) return;
  const mode = f.dataset.mode;
  if (mode === 'edit') Object.assign(S.meals.find(x => x.id === f.dataset.id), m);
  else if (mode === 'quick') logMeal({ ...m, id: null }, ui.foodDate);
  else { const nm = { id: uid(), ...m }; S.meals.push(nm); if (fd.get('log')) logMeal(nm, ui.foodDate); }
  save(); closeSheet(); quiet();
  toast(mode === 'edit' ? 'Updated' : m.name);
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (ui.p && ui.p.rest) restTick();
  if (!ui.p && ui.date < today() && !S.logs[ui.date]) { ui.date = today(); ui.foodDate = today(); render(); }
});

render(true);

if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
