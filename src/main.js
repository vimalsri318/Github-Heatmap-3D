// The main site: an editor around the 3D heatmap that produces embed code.
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@fontsource-variable/doto';
import { createHeatmap, fmtDate } from './lib/heatmap.js';
import { computeStats } from './lib/data.js';
import { THEMES, getTheme, applyThemeToPage } from './lib/themes.js';
import { OPTIONS, parseOptions, toParams, cameraToAngles } from './lib/options.js';
import { STYLES, getStyle } from './lib/styles/index.js';
import { composeSong, createSongPlayer, renderSongWav } from './lib/song.js';
import { CHART_TYPES } from './lib/charts.js';
import { ANIMATIONS } from './lib/svg.js';
import { createViewPad } from './lib/viewpad.js';
import { suggestDesktop } from './lib/desktop-hint.js';
import { owns, signInAvailable, signInWithGoogle, currentAccount, onAccountChange, startAccounts, mountAccountButton, authFetch } from './lib/account.js';
import { pricesFor, money, guessCountry } from './lib/pricing.js';
import { openRegionPicker } from './lib/region-picker.js';

const $ = (id) => document.getElementById(id);

// Public URL the snippets point at. Set VITE_SITE_URL when deploying behind another domain.
const SITE = (import.meta.env.VITE_SITE_URL || location.origin).replace(/\/$/, '');

// Which options each embed type understands.
const EMBED_KEYS = Object.keys(OPTIONS).filter((k) => k !== 'angle' && k !== 'tilt');
const README_KEYS = ['type', 'user', 'year', 'theme', 'height', 'log', 'barSize', 'shadows', 'base', 'labels', 'title', 'transparent', 'angle', 'tilt', 'animate'];

// ---------- state ----------
const params = new URLSearchParams(location.search);
let state = parseOptions(params);
if (!params.has('theme')) {
  try {
    state.theme = getTheme(localStorage.getItem('theme'));
  } catch {}
}

// Phones: start closer (a portrait screen would show the whole board tiny) and keep forests light.
const PHONE = matchMedia('(max-width: 640px)').matches;
const HOW_TO = matchMedia('(pointer: coarse)').matches ? 'Drag to rotate · pinch to zoom' : 'Drag to rotate · scroll to zoom · right-drag to pan';
const map = createHeatmap($('app'), { ...state, homeZoom: PHONE ? 1.7 : 1, maxFps: 60, ...(PHONE && { detail: 'low', shadowMapSize: 1024, maxPixelRatio: 1.5 }) });
if (import.meta.env.DEV) window.__heatmap = map; // for debugging in the console

// ---------- the progress bar: username → world → angle → share ----------
// Each step ticks off as it's done. Clicking one opens a small guide for it, with the
// controls for that step right inside, and a way on to the next.
const done = new Set();
function markStep(n) {
  if (n > 1 && !hasYear()) return; // steps only count once your own year is in
  done.add(n);
  syncGuide();
}
// Nothing after step 1 opens until a real GitHub year is loaded.
const hasYear = () => done.has(1);
const NEED_YEAR = 'First things first: load your GitHub username. Everything after this uses your real year.';
function syncGuide() {
  const next = [1, 2, 3, 4].find((n) => !done.has(n)) ?? 0;
  for (const b of $('guide').querySelectorAll('button')) {
    const n = Number(b.dataset.step);
    for (const el of [b, b.parentElement]) {
      el.toggleAttribute('data-done', done.has(n));
      el.toggleAttribute('data-next', n === next);
      el.toggleAttribute('data-locked', n > 1 && !hasYear());
    }
  }
  $('openDrawer').toggleAttribute('data-locked', !hasYear());
}
function nudge(el) {
  el.classList.remove('nudge');
  void el.offsetWidth;
  el.classList.add('nudge');
}

const STEPS = {
  1: {
    title: 'Bring your year',
    text: 'Type your GitHub username and load it. We only read your public contribution graph, no sign-in.',
    actions: () =>
      `<form class="pop-form" id="popForm"><input id="popUser" placeholder="your-username" autocomplete="off" spellcheck="false" value="${state.user || ''}" /><button type="submit" class="primary">Load</button></form>`,
  },
  2: {
    title: 'Pick a world',
    text: 'Choose how your year looks. Colors are in the bar at the bottom, next to the worlds.',
    actions: () =>
      Object.entries(STYLES)
        .map(([id, st]) => `<button type="button" data-pick-style="${id}" aria-pressed="${state.style === id}">${st.name}${st.pro ? ' <small>PRO</small>' : ''}</button>`)
        .join(''),
  },
  3: {
    title: 'Find your angle',
    text: 'Drag to turn it, scroll or pinch to zoom, or jump to a view. Like it? Keep it as the starting view of your embed.',
    actions: () =>
      ['top', 'front', 'left', 'right'].map((v) => `<button type="button" data-pick-view="${v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('') +
      '<button type="button" class="primary" data-save-view>Keep this angle</button>',
  },
  4: {
    title: 'Share it',
    text: 'Pick where it goes (your website, your GitHub README or a link), copy one line, and we show you exactly where to paste it.',
    actions: () => '<button type="button" class="primary" data-open-share>Share &amp; embed →</button>',
  },
};
let openStep = 0;
function showStep(n, why = '') {
  if (n > 1 && !hasYear()) {
    why = NEED_YEAR;
    n = 1;
  }
  openStep = n;
  $('pop').hidden = !n;
  for (const b of $('guide').querySelectorAll('button')) b.setAttribute('aria-expanded', Number(b.dataset.step) === n);
  if (!n) return;
  const st = STEPS[n];
  $('popStep').textContent = `Step ${n} of 4`;
  $('popTitle').textContent = st.title;
  $('popText').textContent = why || st.text;
  $('popText').classList.toggle('pop-warn', Boolean(why));
  $('popActions').innerHTML = st.actions() + (n < 4 ? `<button type="button" class="pop-next" data-next-step="${n + 1}">Next: ${STEPS[n + 1].title} →</button>` : '');
  // point the arrow at the step's circle
  const circle = $('guide').querySelector(`[data-step="${n}"] b`).getBoundingClientRect();
  const box = $('pop').getBoundingClientRect();
  $('pop').style.setProperty('--x', `${circle.left + circle.width / 2 - box.left}px`);
  if (n === 1) $('popUser').focus();
  if (n === 2) nudge($('controls'));
  if (n === 3) nudge(document.querySelector('.studio-pad'));
}
$('guide').addEventListener('click', (e) => {
  const b = e.target.closest('[data-step]');
  if (!b) return;
  setPreview(false);
  const n = Number(b.dataset.step);
  showStep(openStep === n ? 0 : n);
});
$('popClose').addEventListener('click', () => showStep(0));
$('pop').addEventListener('submit', (e) => {
  e.preventDefault();
  const user = $('popUser').value.trim().replace(/^@/, '');
  if (!user) return $('popUser').focus();
  $('username').value = user;
  update({ user, year: Number(yearSelect.value) });
  showStep(2);
});
$('pop').addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.dataset.pickStyle) {
    update({ style: t.dataset.pickStyle });
    showStep(2); // refresh which one is picked
  } else if (t.dataset.pickView) {
    map.viewFrom(t.dataset.pickView);
    markStep(3);
  } else if ('saveView' in t.dataset) {
    update({ camera: map.getCamera() });
    markStep(3);
    t.textContent = 'Kept ✓';
  } else if ('openShare' in t.dataset) {
    showStep(0);
    setDrawer(true);
  } else if (t.dataset.nextStep) showStep(Number(t.dataset.nextStep));
});
addEventListener('pointerdown', (e) => {
  if (openStep && !e.target.closest('#progress')) showStep(0);
  // dragging the model or using the camera pad counts as finding your angle
  if (e.target.closest('#app canvas, .studio-pad')) markStep(3);
});

// ---------- camera pad + preview ----------
// Preview hides every panel so only the model is left; "Show controls" brings them back.
const previewBtn = document.createElement('button');
previewBtn.type = 'button';
previewBtn.className = 'vp-preview';
previewBtn.title = 'Preview: hide the controls';
previewBtn.innerHTML =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg><span>Preview</span>';
const pad = createViewPad(document.body, map, { extra: previewBtn, className: 'studio-pad', onTour: (tour) => update({ tour }) });
function setPreview(on) {
  document.body.classList.toggle('preview', on);
  $('exitPreview').hidden = !on;
  if (on) setDrawer(false);
}
previewBtn.addEventListener('click', () => setPreview(true));
$('previewTop').addEventListener('click', () => {
  showStep(0);
  setPreview(true);
});
$('exitPreview').addEventListener('click', () => setPreview(false));

// phones: the bottom sheet keeps styles and colors in view, the rest folds under "More"
$('moreToggle').addEventListener('click', () => {
  const open = !$('controls').classList.contains('open');
  $('controls').classList.toggle('open', open);
  $('moreToggle').setAttribute('aria-expanded', open);
});

function update(patch) {
  state = { ...state, ...patch };
  if ('theme' in patch) state.theme = getTheme(state.theme);
  if ('style' in patch) state.style = getStyle(state.style);
  map.setOptions(patch);
  if ('theme' in patch || 'style' in patch || 'palette' in patch) {
    applyPageTheme();
    markStep(2);
  }
  syncInputs();
  syncUrl();
  renderCode();
  if ('tour' in patch) pad?.syncTour();
}

function syncUrl() {
  const url = new URL(location.href);
  url.search = toParams(state, EMBED_KEYS).toString();
  history.replaceState(null, '', url);
  try {
    localStorage.setItem('theme', state.theme);
  } catch {}
}

// ---------- page theme ----------
function applyPageTheme() {
  const style = STYLES[state.style];
  const theme = THEMES[style.theme || state.theme];
  applyThemeToPage(theme);
  renderSwatches(style);
  $('exportStl').disabled = !style.stl;
  $('exportStl').title = style.stl ? '' : 'STL export is available for the City styles';
  for (const b of $('styles').children) b.setAttribute('aria-checked', b.dataset.style === state.style);
  $('styles').querySelector('[aria-checked="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); // the phone row scrolls
  const levels = style.palettes ? (style.palettes[state.palette] ?? Object.values(style.palettes)[0]).levels : theme.levels;
  $('legend').replaceChildren(...levels.map((c) => Object.assign(document.createElement('i'), { style: `background:${c}` })));
}

for (const [id, st] of Object.entries(STYLES)) {
  const b = document.createElement('button');
  b.type = 'button';
  b.role = 'radio';
  b.dataset.style = id;
  b.innerHTML = st.pro ? `${st.name} <small>PRO</small>` : st.name; // the tag becomes ✓ once it's yours (syncPlan)
  b.addEventListener('click', () => update({ style: id }));
  $('styles').appendChild(b);
}

// Color swatches: the City's themes, or the style's own palettes (e.g. Forest seasons).
function renderSwatches(style) {
  const box = $('themes');
  box.replaceChildren();
  box.hidden = Boolean(style.theme) && !style.palettes;
  const entries = style.palettes
    ? Object.entries(style.palettes).map(([id, p]) => [id, p.name, p.levels[0], p.levels[3], { palette: id }, state.palette])
    : Object.entries(THEMES)
        .filter(([, t]) => !t.hidden)
        .map(([id, t]) => [id, t.name, t.background, t.levels[3], { theme: id }, state.theme]);
  for (const [id, name, a, b, patch, current] of entries) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.title = name;
    btn.setAttribute('aria-label', name);
    btn.setAttribute('aria-pressed', id === current);
    btn.style.setProperty('--a', a);
    btn.style.setProperty('--b', b);
    btn.addEventListener('click', () => update(patch));
    box.appendChild(btn);
  }
}

// ---------- option inputs (data-opt="name") ----------
const optInputs = [...document.querySelectorAll('[data-opt]')];

function syncInputs() {
  for (const input of optInputs) {
    const v = state[input.dataset.opt];
    if (input.type === 'checkbox') input.checked = v;
    else input.value = v;
  }
  $('cameraStatus').textContent = state.camera ? 'Using your saved view.' : 'Using the default view.';
}

for (const input of optInputs) {
  const key = input.dataset.opt;
  input.addEventListener(input.type === 'range' ? 'input' : 'change', () => {
    update({ [key]: input.type === 'checkbox' ? input.checked : Number(input.value) });
  });
}

// ---------- data / stats ----------
const yearSelect = $('year');
for (let y = OPTIONS.year.max; y >= OPTIONS.year.min; y--) yearSelect.add(new Option(y, y));
$('username').value = state.user;
yearSelect.value = state.year;

function setStatus(msg, isError = false) {
  $('status').textContent = msg;
  $('status').classList.toggle('error', isError);
}

map.on('loading', ({ user, year }) => {
  player?.pause();
  setStatus(user ? `Loading ${user}'s ${year} contributions…` : '');
});
map.on('error', (err) => {
  setStatus(err.message, true);
  done.clear(); // that username didn't load: back to step 1
  syncGuide();
  showStep(1, `${err.message} Check the spelling and try again.`);
});
map.on('building', () => setStatus('Growing your forest…'));
map.on('built', () => setStatus(HOW_TO));
map.on('load', ({ user, year, days }) => {
  if (user) markStep(1);
  setStatus(user ? HOW_TO : 'Showing sample data — enter a GitHub username.');
  const { total, best, longest } = computeStats(days);
  $('stats').hidden = false;
  $('total').textContent = total.toLocaleString();
  $('totalLabel').textContent = `contributions in ${year}${user ? '' : ' (sample)'}`;
  $('best').textContent = best.count ? `${best.count} · ${fmtDate(best.date, { month: 'short', day: 'numeric' })}` : '–';
  $('streak').textContent = `${longest} day${longest === 1 ? '' : 's'}`;
  setupSong(days, user);
});

// ---------- song ----------
let player = null;
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function setupSong(days, user) {
  player?.destroy();
  map.highlight(-1);
  const song = composeSong(days, user);
  $('player').hidden = false;
  $('songTitle').textContent = `“${song.title}”`;
  $('songMeta').textContent = `${song.artist} · ${song.key} · ${song.bpm} bpm · ${fmtTime(song.duration)}`;
  $('songSeek').max = song.steps - 1;
  $('songSeek').value = 0;
  $('songTime').textContent = '0:00';
  $('songDay').textContent = 'one note per day';
  player = createSongPlayer(song, {
    onStep(i) {
      map.highlight(i);
      $('songSeek').value = i;
      $('songTime').textContent = fmtTime(i * song.stepDur);
      const d = days[i];
      $('songDay').textContent = `${fmtDate(d.date, { month: 'short', day: 'numeric' })} · ${d.count} contribution${d.count === 1 ? '' : 's'}`;
    },
    onState(playing) {
      $('playSong').textContent = playing ? '❚❚' : '▶';
      $('playSong').setAttribute('aria-label', playing ? 'Pause song' : 'Play your year as a song');
    },
    onEnd() {
      map.highlight(-1);
      $('songSeek').value = 0;
    },
  });
}

$('playSong').addEventListener('click', () => (player?.playing ? player.pause() : player?.play()));
$('songSeek').addEventListener('input', (e) => {
  player?.seek(Number(e.target.value));
  map.highlight(Number(e.target.value));
});
$('downloadSong').addEventListener('click', async () => {
  if (!hasYear()) return showStep(1, NEED_YEAR);
  if (!owns('song')) return openPaywall('song');
  if (!player) return;
  const btn = $('downloadSong');
  btn.disabled = true;
  btn.textContent = '…';
  const label = $('songDay').textContent;
  $('songDay').textContent = 'Rendering your song…';
  try {
    const blob = await renderSongWav(player.song);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${state.user || 'sample'}-${state.year}-song.wav`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } finally {
    btn.disabled = false;
    btn.textContent = '⤓';
    $('songDay').textContent = label;
  }
});

$('form').addEventListener('submit', (e) => {
  e.preventDefault();
  update({ user: $('username').value.trim(), year: Number(yearSelect.value) });
});

// ---------- buttons ----------
$('resetView').addEventListener('click', () => map.viewFrom('home'));
$('exportStl').addEventListener('click', () => {
  if (!hasYear()) return showStep(1, NEED_YEAR);
  if (STYLES[state.style].pro && !owns(state.style)) return openPaywall(state.style);
  const blob = map.exportSTL();
  if (!blob) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${state.user || 'sample'}-${state.year}-contributions.stl`;
  a.click();
  URL.revokeObjectURL(a.href);
});
$('saveCamera').addEventListener('click', () => update({ camera: map.getCamera() }));
$('clearCamera').addEventListener('click', () => update({ camera: null }));

// ---------- drawer ----------
function setDrawer(open) {
  if (open && !hasYear()) return showStep(1, NEED_YEAR); // no sharing a sample year
  if (open && STYLES[state.style].pro && !owns(state.style)) return openPaywall(state.style);
  if (open) {
    markStep(4);
    takeShot();
    showDone(false);
  }
  $('drawer').hidden = !open;
  document.body.classList.toggle('drawer-open', open);
  if (open) renderCode();
}
$('openDrawer').addEventListener('click', () => setDrawer($('drawer').hidden));
$('closeDrawer').addEventListener('click', () => setDrawer(false));
addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  showStep(0);
  setDrawer(false);
  setPreview(false);
});

// ---------- embed code ----------
let tab = 'website';

const TAB_HINTS = {
  website: 'One line of HTML with the live, spinnable 3D. Set the size it should take on your page.',
  script: 'Same live 3D, as a div plus a small script. Every option is a data-* attribute you can edit by hand.',
  readme: 'READMEs only show images, so this is an animated picture of your current view (or a 2D card) that links to the live 3D. No scripts or GIFs needed.',
  link: 'A link to exactly this view: your world, colors and angle.',
};

// Step 3: how to put it where it goes, with a little picture of the place.
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function howTo() {
  const user = esc(state.user || 'your-username');
  const web = [
    'Press <b>Copy code</b> above.',
    'Open your page’s HTML, or the <b>Embed</b> / <b>Custom code</b> block of your site builder (WordPress, Webflow, Framer, Squarespace…).',
    'Paste it where the model should appear, then publish.',
  ];
  return {
    website: { steps: web, pic: 'site' },
    script: { steps: [...web.slice(0, 2), 'Paste it where the model should appear and publish. Several models? The script only loads once.'], pic: 'site' },
    readme: {
      steps: [
        'Press <b>Copy code</b> above.',
        `Open <b>github.com/${user}/${user}</b>: the repository named after you, whose README shows on your profile. No such repository? Create a public one named exactly <b>${user}</b> and tick “Add a README”.`,
        'Click the pencil on <b>README.md</b>, paste the line, then <b>Commit changes</b>. The picture refreshes every hour.',
      ],
      pic: 'readme',
    },
    link: {
      steps: ['Press <b>Copy code</b> above.', 'Paste it anywhere: a chat, a post, your CV or your bio.', 'Whoever opens it gets the live 3D, no account needed.'],
      pic: 'link',
    },
  }[tab];
}
// Pictures of the place it goes, with the real thing in them: a snapshot of the current
// view for websites and links, the actual README image for READMEs.
let shot = '';
function takeShot() {
  try {
    shot = map.snapshot(state.transparent ? 'image/png' : 'image/jpeg', 0.85);
  } catch {
    shot = '';
  }
}
const img = (src, cls = '') => (src ? `<img class="${cls}" src="${esc(src)}" alt="" />` : '');
const PICS = {
  site: () =>
    `<div class="pic-site"><div class="pic-bar"><i></i><i></i><i></i><span>yourname.dev</span></div><div class="pic-body"><b></b><i></i><i class="short"></i><div class="pic-slot has-img">${img(shot)}</div></div></div>`,
  readme: () =>
    `<div class="pic-readme"><div class="pic-bar">${esc(state.user || 'you')} / <b>README.md</b> <span class="pic-pencil">✎</span></div><div class="pic-body"><b>Hi there</b><i></i><div class="pic-slot has-img light">${img(`/api/heatmap?${readmeParams()}`)}</div></div></div>`,
  link: () =>
    `<div class="pic-chat"><span class="pic-msg">Here’s my year!</span><span class="pic-msg pic-card">${img(shot)}<b>@${esc(state.user || 'you')} · ${state.year} in 3D</b><small>${esc(location.host)}</small></span></div>`,
};

const kebab = (s) => s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
const cssSize = (v) => (/^\d+$/.test(v.trim()) ? `${v.trim()}px` : v.trim() || '100%');

function readmeParams() {
  const type = $('readmeType').value;
  const animate = type === '3d' ? $('readmeAnim').value : '0'; // only the 3D board animates
  const opts = { ...state, ...(state.camera ? cameraToAngles(state.camera) : {}), type, animate };
  return toParams(opts, README_KEYS);
}

// Pro worlds (and embeds without the badge) carry a key from our server proving they
// were paid for; without it the embed shows the free City. Fetched once per world.
const embedKeys = {};
function embedKeyFor() {
  const item = STYLES[state.style].pro ? state.style : state.badge ? null : 'pro';
  if (!item || !owns(item)) return '';
  if (embedKeys[item] === undefined) {
    embedKeys[item] = null; // asking
    authFetch(`/api/embed-key?item=${item}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then(({ key }) => {
        embedKeys[item] = key;
        renderCode();
      })
      .catch(() => delete embedKeys[item]);
  }
  return embedKeys[item] || '';
}

function renderCode() {
  if ($('drawer').hidden) return;
  const embedQuery = toParams({ ...state, key: embedKeyFor() }, EMBED_KEYS).toString();
  const pageQuery = toParams(state, EMBED_KEYS).toString(); // links to the Studio don't need the key
  const pageUrl = `${SITE}/studio.html${pageQuery ? '?' + pageQuery : ''}`;
  const embedUrl = `${SITE}/embed.html${embedQuery ? '?' + embedQuery : ''}`;
  const name = state.user || 'sample';
  const w = $('embedWidth').value;
  const h = $('embedHeight').value;
  let code = '';
  let preview = pageUrl;

  if (tab === 'website') {
    code = `<iframe src="${embedUrl}"\n  style="width: ${cssSize(w)}; height: ${cssSize(h)}; border: 0"\n  title="${name}'s GitHub contributions in 3D" loading="lazy"></iframe>`;
    preview = embedUrl;
  } else if (tab === 'script') {
    const attrs = [...new URLSearchParams(embedQuery)].map(([k, v]) => `\n  data-${kebab(k)}="${v}"`).join('');
    code = `<div data-github-heatmap-3d${attrs}\n  style="width: ${cssSize(w)}; height: ${cssSize(h)}"></div>\n<script src="${SITE}/embed.js" async></script>`;
    preview = embedUrl;
  } else if (tab === 'readme') {
    const img = `${SITE}/api/heatmap?${readmeParams()}`;
    code = `[![${name}'s GitHub contributions in 3D](${img})](${pageUrl})`;
    preview = img;
    $('readmePreview').src = `/api/heatmap?${readmeParams()}`;
  } else {
    code = pageUrl;
  }

  $('code').textContent = code;
  const how = howTo();
  $('howto').innerHTML = how.steps.map((t) => `<li>${t}</li>`).join('');
  $('howtoPic').innerHTML = PICS[how.pic]();
  $('previewLink').href = preview;
  $('tabHint').textContent = TAB_HINTS[tab];
  $('sizeFields').hidden = !(tab === 'website' || tab === 'script');
  $('readmeTypeField').hidden = tab !== 'readme';
  $('readmeAnimField').hidden = tab !== 'readme' || $('readmeType').value !== '3d';
  $('readmePreview').hidden = tab !== 'readme';
}

// Step 1: where it goes. A website can take an iframe or a script tag.
let webKind = 'website';
function setTab(t) {
  tab = t;
  if (t === 'website' || t === 'script') webKind = t;
  const dest = t === 'script' ? 'website' : t;
  for (const b of $('dests').children) b.setAttribute('aria-checked', b.dataset.dest === dest);
  for (const b of $('embedKind').children) b.setAttribute('aria-selected', b.dataset.tab === t);
  $('embedKind').hidden = dest !== 'website';
  if (!$('drawer').hidden) takeShot();
  renderCode();
}
$('dests').addEventListener('click', (e) => {
  const b = e.target.closest('[data-dest]');
  if (b) setTab(b.dataset.dest === 'website' ? webKind : b.dataset.dest);
});
$('embedKind').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (b) setTab(b.dataset.tab);
});
$('embedWidth').addEventListener('input', renderCode);
for (const [id, name] of [['3d', '3D board (City)'], ...Object.entries(CHART_TYPES)]) $('readmeType').add(new Option(name, id));
$('readmeType').addEventListener('change', renderCode);
for (const [id, name] of [['grow', ANIMATIONS.grow], ['loop', ANIMATIONS.loop], ['0', 'None (still image)']]) $('readmeAnim').add(new Option(name, id));
$('readmeAnim').addEventListener('change', renderCode);
$('embedHeight').addEventListener('input', renderCode);

$('copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('code').textContent);
  } catch {
    $('copy').textContent = 'Select & copy manually';
    setTimeout(() => ($('copy').textContent = 'Copy code'), 1500);
    return;
  }
  showDone(true);
});

// ---------- after Copy: what they made, and what it will look like ----------
const DEST_NAMES = { website: 'your website', script: 'your website', readme: 'your GitHub README', link: 'anywhere you like' };
function showDone(on) {
  $('drawer').classList.toggle('is-done', on);
  $('done').hidden = !on;
  if (!on) return;
  const style = STYLES[state.style];
  const colors = style.palettes ? (style.palettes[state.palette] ?? Object.values(style.palettes)[0]).name : style.theme ? 'Built in' : THEMES[state.theme].name;
  $('doneLead').textContent = `The code is on your clipboard, ready for ${DEST_NAMES[tab]}. This is how it will look:`;
  $('donePreview').innerHTML = PICS[howTo().pic]();
  const made = [
    ['Year', `@${state.user || 'sample'} · ${state.year}`],
    ['World', style.name],
    ['Colors', colors],
    ['Angle', state.camera ? 'Your saved angle' : 'Default angle'],
    ...(tab === 'website' || tab === 'script' ? [['Size', `${$('embedWidth').value} × ${$('embedHeight').value}`]] : []),
  ];
  $('doneMade').innerHTML = made.map(([k, v]) => `<span><small>${k}</small><b>${esc(v)}</b></span>`).join('');
  $('doneNext').innerHTML = howTo().steps.slice(1).map((t) => `<li>${t}</li>`).join('');
  $('doneOpen').href = $('previewLink').href;
  $('drawer').scrollTop = 0;
}
$('doneAgain').addEventListener('click', () => showDone(false));
$('doneClose').addEventListener('click', () => setDrawer(false));

// ---------- go ----------
applyPageTheme();
syncInputs();
syncUrl();
syncGuide();
setTab('website');
suggestDesktop();

// ---------- the paywall ----------
// Shown at the moment a Pro world is about to leave the Studio (share, STL, song), never
// before: you can look at every world for free. Prices are framed per day, a single world
// can be bought on its own, and the yearly plan is picked by default as the best value.
// Prices follow the visitor's country (a guess they can change with the globe picker).
let country = guessCountry();
const PLANS = {
  world: (p, name) => `${money(p.world, p.currency)} one time. ${name} stays yours, with embeds, README pictures and STL.`,
  year: (p) => `${money(p.year, p.currency)} billed once a year. That’s ${money(p.year / 12, p.currency)} a month, ${Math.round((1 - p.year / (p.month * 12)) * 100)}% less than monthly.`,
  month: (p) => `${money(p.month, p.currency)} billed every month. Cancel anytime.`,
  life: (p) => `${money(p.life, p.currency)} once. No subscription, ever, and every world we add.`,
};
function renderPrices() {
  const p = pricesFor(country);
  const day = (n) => money(n, p.currency);
  $('payFlag').textContent = p.country.flag;
  $('payCountryName').textContent = p.country.name;
  $('ppWorld').textContent = money(p.world, p.currency);
  $('ppYear').textContent = day(p.perDay.year);
  $('ppYearWas').textContent = day(p.perDay.month);
  $('ppMonth').textContent = day(p.perDay.month);
  setPayPlan(payPlan);
}
$('payCountry').addEventListener('click', () =>
  openRegionPicker({
    current: country,
    onPick: (code) => {
      country = code;
      renderPrices();
    },
  }),
);
let payItem = '';
let payPlan = 'year';
function openPaywall(item) {
  payItem = item;
  const whole = item === 'pro'; // "Upgrade" from the plan chip: all of Pro, no single world
  const name = item === 'song' ? 'your song' : whole ? 'Pro' : STYLES[item].name;
  $('payTitle').textContent = item === 'song' ? 'Keep your song' : whole ? 'Go Pro' : `Keep your ${name}`;
  $('payLead').textContent =
    item === 'song'
      ? 'Your year, as music. Unlock it to download the song.'
      : whole
        ? 'Every world, your song, HD pictures and no badge on your embeds.'
        : `You made it. Unlock ${name} to share it, embed it on your site and README, and print it.`;
  $('payWorldName').textContent = item === 'song' ? 'Just the song' : `Just ${name}`;
  $('payPlans').querySelector('[data-plan="world"]').hidden = whole;
  if (whole && payPlan === 'world') payPlan = 'year';
  $('payReady').textContent = item === 'song' ? '♪ Your song is ready' : whole ? 'Your year, in every world' : `Your ${name} is ready`;
  try {
    $('payShot').src = map.snapshot('image/jpeg', 0.85);
  } catch {}
  renderPrices();
  const who = currentAccount();
  $('googleBtn').lastChild.textContent = who ? ` Continue as ${who.name?.split(' ')[0] || who.email}` : ' Continue with Google';
  $('payNote').textContent = 'Cancel anytime. Your City stays free forever.';
  $('payNote').classList.remove('pay-warn');
  $('paywall').showModal();
}
function setPayPlan(plan) {
  payPlan = plan;
  for (const b of $('payPlans').children) b.setAttribute('aria-checked', b.dataset.plan === plan);
  $('payBilled').textContent = PLANS[plan](pricesFor(country), payItem === 'song' ? 'Your song' : STYLES[payItem]?.name ?? '');
}
$('payPlans').addEventListener('click', (e) => {
  const b = e.target.closest('[data-plan]');
  if (b) setPayPlan(b.dataset.plan);
});
$('payClose').addEventListener('click', () => $('paywall').close());
$('paywall').addEventListener('click', (e) => e.target === $('paywall') && $('paywall').close());
const PENDING = 'pay-after-sign-in'; // Google sign-in may leave the page; reopen the paywall on return
function signedInNote() {
  const who = currentAccount();
  $('payNote').textContent = `Signed in as ${who?.email || who?.name}. Secure checkout opens very soon; we’ll keep your choice for when it does.`;
  $('payNote').classList.add('pay-warn');
  $('payPlans').closest('.paywall').querySelectorAll('.pay-steps li').forEach((li, k) => li.classList.toggle('on', k <= 1));
}
$('googleBtn').addEventListener('click', async () => {
  const note = $('payNote');
  try {
    if (!currentAccount()) {
      try {
        sessionStorage.setItem(PENDING, JSON.stringify({ item: payItem, plan: payPlan }));
      } catch {}
      $('paywall').close(); // Clerk's sign-in window opens on top of the page
      await signInWithGoogle();
      sessionStorage.removeItem(PENDING);
      openPaywall(payItem);
    }
    // signed in: the next stop is checkout, which isn't connected yet
    signedInNote();
  } catch (err) {
    note.textContent = err.message === 'setup' ? 'Google sign-in and checkout are being connected and open very soon. Until then you can try every world here for free.' : err.message;
    note.classList.add('pay-warn');
  }
});
if (!signInAvailable()) $('googleBtn').title = 'Opening soon';
// the account button in the top-left card: Sign in, or Clerk's avatar menu once signed in
let accountShown = '';
function syncAccountButton(a) {
  const id = a?.id || '';
  if (id === accountShown) return;
  accountShown = id;
  const slot = $('account');
  if (a) {
    slot.innerHTML = '';
    mountAccountButton(slot);
  } else {
    slot.innerHTML = '<button type="button" class="signin-btn" id="signInBtn">Sign in</button>';
  }
}
$('account').addEventListener('click', (e) => {
  if (!e.target.closest('#signInBtn')) return;
  if (!signInAvailable()) return showStep(1, 'Accounts open very soon. Everything here works without one for now.');
  signInWithGoogle().catch(() => {});
});
// What plan you're on, always in view: "Free · Upgrade", or a gold PRO.
function syncPlan() {
  const chip = $('planChip');
  const pro = owns('pro');
  chip.hidden = !currentAccount();
  chip.toggleAttribute('data-pro', pro);
  chip.innerHTML = pro ? '✦ PRO' : 'Free · <b>Upgrade</b>';
  chip.title = pro ? 'You have every Pro world' : 'See what Pro unlocks';
  for (const b of $('styles').children) {
    const tag = b.querySelector('small');
    if (tag) tag.textContent = owns(b.dataset.style) ? '✓ YOURS' : 'PRO';
  }
}
$('planChip').addEventListener('click', () => !owns('pro') && openPaywall('pro'));
onAccountChange((a) => {
  syncPlan();
  syncAccountButton(a);
  // back from Google with a paywall to finish: open it again where they left off
  let pending = null;
  try {
    pending = JSON.parse(sessionStorage.getItem(PENDING) || 'null');
  } catch {}
  if (a && pending && !$('paywall').open) {
    sessionStorage.removeItem(PENDING);
    payPlan = pending.plan || payPlan;
    openPaywall(pending.item);
    signedInNote();
  }
});
startAccounts();

// a purchase lands (the server updates the account): close the paywall and carry on
onAccountChange(() => {
  if (!$('paywall').open || !owns(payItem)) return;
  $('paywall').close();
  if (payItem === 'song') $('downloadSong').click();
  else setDrawer(true);
});
