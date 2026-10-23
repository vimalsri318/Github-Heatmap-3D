// Landing page: one live 3D hero, expanding style cards that open a live viewer,
// a bento of features and pricing. Only one 3D view renders at a time, and only while visible.
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import '@fontsource-variable/doto';
import './landing.css';
import { createHeatmap } from './lib/heatmap.js';
import { demoContributions } from './lib/data.js';
import { THEMES } from './lib/themes.js';
import { FOREST_PALETTES } from './lib/styles/forest.js';
import { composeSong, createSongPlayer } from './lib/song.js';
import { renderChartSvg } from './lib/charts.js';
import { renderSvg } from './lib/svg.js';
import { createViewPad } from './lib/viewpad.js';
import { suggestDesktop } from './lib/desktop-hint.js';
import { startAccounts, signInWithGoogle, mountAccountButton, onAccountChange, signInAvailable, owns } from './lib/account.js';
import { pricesFor, money, guessCountry } from './lib/pricing.js';
import { openRegionPicker } from './lib/region-picker.js';
import { defaults } from './lib/options.js';

// The landing page shows a built-in demo year (every month filled), labelled as yours.
const HERO_USER = 'you';
const DEMO = { user: HERO_USER, demo: true };
const YEAR = new Date().getFullYear();
const $ = (id) => document.getElementById(id);

// Styles with glow need an opaque canvas; the others float on the page.
const GLOWS = new Set(['night', 'galaxy']);
const PAGE_DARK = '#08080a'; // = --bg in dark mode, so the scene has no visible edge
const isLight = () => document.documentElement.dataset.mode === 'light';

// Phones get lighter scenes: forests are the heaviest thing on the page.
const MOBILE = matchMedia('(pointer: coarse)').matches || innerWidth < 760;

// The colors picked in the dock. City's null = GitHub's own green, following light/dark.
const colors = { city: null, forest: 'spring' };
const cityTheme = () => colors.city ?? (isLight() ? 'github-light' : 'github');

// How the hero shows a style in the current mode. Forests grow bigger here, on a log
// scale, so even quiet days become real trees and it reads as a full forest.
function heroOptions(style) {
  const glow = GLOWS.has(style);
  const forest = style === 'forest';
  return {
    style,
    theme: cityTheme(),
    palette: colors.forest,
    transparent: !glow,
    background: glow && !isLight() ? PAGE_DARK : undefined,
    height: forest ? 15 : 8,
    log: forest,
    ...phoneTuning(style),
  };
}
// On phones the forest draws at a lower resolution, without shadows, at 30 fps.
function phoneTuning(style) {
  if (!MOBILE) return {};
  const forest = style === 'forest';
  return { maxPixelRatio: forest ? 1 : 1.5, maxFps: forest ? 30 : 60, shadows: !forest };
}
const PERF = { maxFps: 60, detail: MOBILE ? 'low' : 'high', shadowMapSize: MOBILE ? 1024 : 2048 };
const daysPromise = Promise.resolve(demoContributions(YEAR));

// Vertical swipes scroll the page on phones; horizontal drags still spin the model.
const allowPageScroll = (el) => el.querySelectorAll('canvas').forEach((c) => (c.style.touchAction = 'pan-y'));

function studioUrl(params) {
  const user = $('tryUser').value.trim().replace(/^@/, '');
  const q = new URLSearchParams({ ...(user ? { user } : {}), ...params });
  return `/studio.html?${q}`;
}
const heroStudioParams = () =>
  heroStyle === 'city' ? { style: 'city', theme: cityTheme() } : heroStyle === 'forest' ? { style: 'forest', palette: colors.forest } : { style: heroStyle };

// ---------- hero ----------
// Every world starts as the flat graph GitHub shows, then tips back and grows into 3D.
let heroStyle = 'city';
const view = $('heroView');
const hero = createHeatmap($('heroStage'), {
  ...DEMO,
  year: YEAR,
  ...heroOptions(heroStyle),
  zoom: 'pinch', // pinch to zoom; a plain scroll still scrolls the page
  homeZoom: MOBILE ? 2.2 : 1.45, // closer than fit-everything, so the detail reads
  rotateSpeed: 0.45,
  maxPixelRatio: 1.5,
  ...PERF,
});
allowPageScroll($('heroStage'));
if (import.meta.env.DEV) window.__hero = hero; // for debugging
hero.setPaused(true); // nothing to draw until the graph turns 3D
hero.on('building', () => {
  $('heroHint').textContent = 'Growing the forest…';
  $('heroHint').hidden = false;
});
hero.on('built', () => ($('heroHint').hidden = true));

// the flat graph
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const flat = $('heroFlat');
let flatCols = 53;
daysPromise.then((days) => {
  const offset = new Date(days[0].date + 'T00:00:00Z').getUTCDay();
  flatCols = Math.ceil((days.length + offset) / 7);
  flat.style.setProperty('--cols', flatCols);
  $('ghTotal').textContent = days.reduce((n, d) => n + d.count, 0).toLocaleString('en-US');
  const pad = '<i class="pad"></i>'.repeat(offset);
  $('ghGrid').innerHTML = pad + days.map((d, i) => `<i data-l="${d.level}" style="--c:${Math.floor((i + offset) / 7)}"></i>`).join('');
  let last = -1;
  $('ghMonths').innerHTML = days
    .map((d, i) => {
      const m = Number(d.date.slice(5, 7)) - 1;
      const col = Math.floor((i + offset) / 7);
      if (m === last || (i + offset) % 7 !== 0 || col > flatCols - 3) return '';
      last = m;
      return `<span style="grid-column:${col + 1}">${MONTHS[m]}</span>`;
    })
    .join('');
  sizeFlat();
});
// Size the squares to the space, and return how much of the view's width the grid covers,
// so the 3D board can start out at exactly that size.
function sizeFlat() {
  const w = view.clientWidth;
  // leave the gutters (and the color dock, beside it on wide screens), then the card's padding and weekday labels
  const room = Math.min(w - (w < 760 ? 32 : 200), 1040) - (w < 560 ? 24 : 72);
  const pitch = Math.max(5, Math.min(22, room / flatCols));
  const gap = Math.max(1, Math.round(pitch * 0.2));
  flat.style.setProperty('--cell', `${(pitch - gap).toFixed(2)}px`);
  flat.style.setProperty('--gap', `${gap}px`);
  flat.classList.toggle('tiny', pitch < 9);
  return (pitch * flatCols) / w;
}
function flatColors() {
  // night-time worlds come from GitHub's dark mode; the others match the page
  flat.toggleAttribute('data-dark', GLOWS.has(heroStyle) || !isLight());
}
function popFlat() {
  flat.classList.remove('play');
  void flat.offsetWidth; // restart the squares' animation
  flat.classList.add('play');
}

// 2D or 3D: what the toggle says. Choosing a world always passes through 2D first.
let wanted = '3d';
let seq = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function setView(v) {
  view.dataset.view = v;
  if (v === '3d') {
    for (const b of view.querySelectorAll('.vp [data-on]')) b.removeAttribute('data-on'); // back to the default angle
    hero.setPaused(false);
    hero.intro({ span: sizeFlat() });
  } else {
    setTimeout(() => view.dataset.view === '2d' && hero.setPaused(true), 600); // once it has faded
  }
}
async function present({ hold = 1100 } = {}) {
  const my = ++seq;
  flatColors();
  if (view.dataset.view !== '2d') setView('2d');
  popFlat();
  await sleep(hold);
  await hero.ready();
  if (my === seq && wanted === '3d') setView('3d');
}

const seg = $('heroStyles');
function moveGlider(group = seg) {
  const on = group.querySelector('[aria-checked="true"]');
  const glider = group.querySelector('.seg-glider');
  glider.style.width = `${on.offsetWidth}px`;
  glider.style.transform = `translateX(${on.offsetLeft}px)`;
}
function selectStyle(style) {
  if (style === heroStyle) return;
  heroStyle = style;
  for (const x of seg.querySelectorAll('button')) x.setAttribute('aria-checked', x.dataset.style === style);
  moveGlider();
  hero.setPaused(true); // freeze the old world while it fades out
  applyHero();
  renderDock();
  present({ hold: 900 });
}
seg.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-style]');
  if (b) selectStyle(b.dataset.style);
});

// the camera pad on the left of the view, with the 2D / 3D switch at its top
const toggle = document.createElement('div');
toggle.className = 'vp-mode';
toggle.setAttribute('role', 'radiogroup');
toggle.setAttribute('aria-label', 'View');
toggle.innerHTML = ['2d', '3d'].map((v) => `<button type="button" role="radio" data-view="${v}">${v.toUpperCase()}</button>`).join('');
createViewPad(view, hero, { extra: toggle, className: 'hero-pad' });
function syncToggle() {
  for (const x of toggle.querySelectorAll('button')) x.setAttribute('aria-checked', x.dataset.view === wanted);
}
toggle.addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-view]');
  if (!b || b.dataset.view === wanted) return;
  wanted = b.dataset.view;
  syncToggle();
  const my = ++seq;
  if (wanted === '2d') {
    flatColors();
    setView('2d');
    popFlat();
  } else {
    await hero.ready();
    if (my === seq) setView('3d');
  }
});

function applyHero() {
  hero.setOptions(heroOptions(heroStyle));
  // light page + night-time world: present it on a dark screen
  view.toggleAttribute('data-card', isLight() && GLOWS.has(heroStyle));
  $('navStudio').href = studioUrl(heroStudioParams());
}

// ---------- the color dock: try the themes on the hero ----------
const CITY_COLORS = Object.entries(THEMES)
  .filter(([, t]) => !t.hidden)
  .map(([id, t]) => ({ id, name: t.name, a: t.levels[1], b: t.levels[4] }));
const FOREST_COLORS = Object.entries(FOREST_PALETTES).map(([id, p]) => ({ id, name: `Forest ${p.name}`, a: p.levels[1], b: p.levels[4] }));
const swatch = (c, on) =>
  `<button type="button" role="radio" data-color="${c.id}" aria-checked="${on}" aria-label="${c.name}" title="${c.name}" style="--a:${c.a};--b:${c.b}"></button>`;

// the Features section's swatches: every City theme, page background against its strongest color
$('swatches').innerHTML = CITY_COLORS.map((c) => swatch({ ...c, a: THEMES[c.id].background, b: THEMES[c.id].levels[3] }, false)).join('');

function renderDock() {
  const list = heroStyle === 'city' ? CITY_COLORS : heroStyle === 'forest' ? FOREST_COLORS : null;
  $('colorDock').hidden = !list; // night city and galaxy have their own fixed colors
  if (!list) return;
  const current = heroStyle === 'city' ? cityTheme() : colors.forest;
  $('colorList').innerHTML = list.map((c) => swatch(c, c.id === current)).join('');
}
function pickColor(style, id) {
  if (style === 'city') colors.city = id;
  else colors.forest = id;
  if (heroStyle !== style) {
    selectStyle(style);
    return;
  }
  applyHero();
  renderDock();
  if (wanted === '2d') {
    // they want to see the colors: show the model
    wanted = '3d';
    syncToggle();
    hero.ready().then(() => setView('3d'));
  }
}
$('colorList').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-color]');
  if (b) pickColor(heroStyle, b.dataset.color);
});
renderDock();

// ---------- light / dark ----------
$('modeToggle').addEventListener('click', () => {
  const mode = isLight() ? 'dark' : 'light';
  document.documentElement.dataset.mode = mode;
  try {
    localStorage.setItem('mode', mode);
  } catch {}
  // GitHub's green follows the page between its light and dark versions
  if (colors.city === 'github' || colors.city === 'github-light') colors.city = null;
  applyHero();
  flatColors();
  renderDock();
  daysPromise.then(renderFeatureArt);
  daysPromise.then(renderReadmeArt);
});
applyHero();
flatColors();
addEventListener('resize', () => {
  moveGlider();
  sizeFlat();
});
document.fonts?.ready.then(() => moveGlider());
moveGlider();
syncToggle();
present({ hold: 1400 }); // the first look: GitHub's graph, then it rises

$('tryForm').addEventListener('submit', (e) => {
  e.preventDefault();
  location.href = studioUrl(heroStudioParams());
});

// ---------- build: the username box ----------
let buildStyle = 'city';
$('buildWorlds').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-style]');
  if (!b) return;
  buildStyle = b.dataset.style;
  for (const x of $('buildWorlds').querySelectorAll('button')) x.setAttribute('aria-checked', x === b);
});
$('buildForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const user = $('buildUser').value.trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?github\.com\//, '').split('/')[0];
  if (!user) return $('buildUser').focus();
  location.href = `/studio.html?${new URLSearchParams({ user, style: buildStyle })}`;
});

// ---------- explore: expanding cards open a live viewer ----------
const WORLDS = {
  night: { title: 'Night City', kicker: 'Pro · 3D', opts: { style: 'night' } },
  galaxy: { title: 'Galaxy', kicker: 'Pro · 3D', opts: { style: 'galaxy' } },
  forest: { title: 'Forest', kicker: 'Pro · 3D', opts: { style: 'forest', palette: 'spring', height: 15, log: true } },
  sakura: { title: 'Forest · Sakura', kicker: 'Pro · 3D', opts: { style: 'forest', palette: 'sakura', height: 15, log: true } },
  city: { title: 'City', kicker: 'Free · 3D', opts: { style: 'city', theme: 'github-light' } },
};

const viewer = $('viewer');
let viewerMap = null;
function openViewer(key, extra = {}) {
  const base = WORLDS[key];
  const w = { ...base, opts: { ...base.opts, ...extra } };
  $('viewerTitle').textContent = w.title;
  $('viewerKicker').textContent = w.kicker;
  $('viewerStudio').href = studioUrl(w.opts);
  $('viewerHint').hidden = false;
  viewer.showModal();
  if (!viewerMap) {
    viewerMap = createHeatmap($('viewerStage'), { ...DEMO, year: YEAR, rotateSpeed: 0.6, maxPixelRatio: 1.5, ...PERF, ...phoneTuning(w.opts.style), ...w.opts });
    createViewPad($('viewerStage'), viewerMap, { className: 'viewer-pad' });
    viewerMap.on('load', () => ($('viewerHint').hidden = true));
    viewerMap.on('built', () => ($('viewerHint').hidden = true));
    viewerMap.on('building', () => {
      $('viewerHint').textContent = 'Growing the forest…';
      $('viewerHint').hidden = false;
    });
  } else {
    viewerMap.setOptions({ palette: 'spring', theme: 'sand', height: 8, log: false, ...phoneTuning(w.opts.style), ...w.opts });
    $('viewerHint').hidden = w.opts.style !== 'forest';
  }
}
$('viewerClose').addEventListener('click', () => viewer.close());
viewer.addEventListener('click', (e) => e.target === viewer && viewer.close()); // click on the backdrop
// (closing hides the stage, so the viewer's 3D stops rendering on its own)

$('expand').addEventListener('click', (e) => {
  const card = e.target.closest('[data-open]');
  if (!card) return;
  if (card.dataset.open === 'song') toggleSong();
  else openViewer(card.dataset.open);
});

// ---------- the song card ----------
let player = null;
let waveBars = [];
const BAR_DAYS = 5; // each bar of the little waveform is five days
daysPromise.then((days) => {
  const song = composeSong(days, HERO_USER);
  $('songTitle').textContent = `“${song.title}”`;
  $('songMeta').textContent = `A demo ${YEAR} · ${song.key} · ${song.bpm} bpm. Press to play.`;
  const max = Math.max(1, ...days.map((d) => d.count));
  for (let k = 0; k < days.length; k += BAR_DAYS) {
    const peak = Math.max(...days.slice(k, k + BAR_DAYS).map((d) => d.count));
    const i = document.createElement('i');
    i.style.height = `${peak ? 10 + Math.sqrt(peak / max) * 90 : 4}%`;
    $('songWave').appendChild(i);
    waveBars.push(i);
  }
  player = createSongPlayer(song, {
    onStep: (step) => waveBars.forEach((b, k) => b.classList.toggle('on', k * BAR_DAYS <= step)),
    onState(playing) {
      $('songIcon').textContent = playing ? '❚❚' : '▶';
      for (const b of document.querySelectorAll('.show-song .show-actions button')) b.textContent = playing ? 'Pause' : 'Play it';
      $('songCard').classList.toggle('is-open', playing);
    },
    onEnd: () => waveBars.forEach((b) => b.classList.remove('on')),
  });
});
function toggleSong() {
  if (!player) return;
  player.playing ? player.pause() : player.play();
}

// ---------- features ----------
// The cards follow the page until a swatch in "Your colors" is picked.
let featureTheme = null;
function renderFeatureArt(days) {
  const theme = featureTheme ?? (isLight() ? 'sand' : 'halloween');
  for (const b of $('swatches').children) b.setAttribute('aria-checked', b.dataset.color === theme);
  $('cardArt').innerHTML = renderChartSvg('card', days, { user: HERO_USER, theme });
  $('donutArt').innerHTML = renderChartSvg('donut', days, { user: HERO_USER, theme });
}
// tap a theme to recolor the cards in this section
$('swatches').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-color]');
  if (!b) return;
  featureTheme = b.dataset.color;
  daysPromise.then(renderFeatureArt);
});

// your year as a 3D print, in the filament you pick
const FILAMENTS = { orange: '#ef9459', white: '#f1efe9', black: '#3a3a40', green: '#40c463', blue: '#4fb0dc' };
function renderPrint(days, filament = 'orange') {
  const c = FILAMENTS[filament];
  const colors = { plinth: c, levels: [c, c, c, c, c] };
  $('printArt').innerHTML = renderSvg(days, { ...defaults(), theme: 'print', colors, transparent: true, labels: false, title: false, height: 12, angle: -24, tilt: 38 });
}
daysPromise.then((days) => renderPrint(days));
$('filament').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-filament]');
  if (!b) return;
  for (const x of $('filament').querySelectorAll('button')) x.setAttribute('aria-checked', x === b);
  daysPromise.then((days) => renderPrint(days, b.dataset.filament));
});

// ---------- explore: the free City in every theme, at different angles ----------
// Rendered as flat SVG pictures (no WebGL), drawn once the section comes near.
const MOSAIC = [
  { theme: 'github-light', angle: -20, tilt: 30, big: true, zoom: 1.3 },
  { theme: 'github', angle: 0, tilt: 84, zoom: 1.9 }, // straight down: the GitHub graph itself
  { theme: 'sand', angle: -40, tilt: 26, zoom: 2.2 },
  { theme: 'ocean', angle: 25, tilt: 34, zoom: 1.4 },
  { theme: 'neon', angle: -60, tilt: 20, zoom: 2.4 },
  { theme: 'forest', angle: 10, tilt: 50, zoom: 1.6 },
  { theme: 'sunset', angle: -25, tilt: 30, zoom: 2 },
  { theme: 'halloween', angle: 40, tilt: 22, zoom: 2.3 },
  { theme: 'github-light', angle: 55, tilt: 30, zoom: 2.1 },
];
function renderMosaic(days) {
  $('cityMosaic').innerHTML = MOSAIC.map((m) => {
    const svg = renderSvg(days, { ...defaults(), user: HERO_USER, theme: m.theme, labels: m.big, title: false, shadows: false, angle: m.angle, tilt: m.tilt, transparent: true });
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const t = THEMES[m.theme];
    return `<button type="button" class="tile${m.big ? ' tile-big' : ''}" data-theme="${m.theme}" style="--bg:${t.background};--z:${m.zoom ?? 1}" aria-label="Open the City in ${t.name}">
      <img src="${url}" alt="" decoding="async" /><span>${t.name}</span></button>`;
  }).join('');
}
const mosaicSeen = new IntersectionObserver(([e]) => {
  if (!e.isIntersecting) return;
  mosaicSeen.disconnect();
  daysPromise.then(renderMosaic);
}, { rootMargin: '400px' });
mosaicSeen.observe($('cityMosaic'));
$('cityMosaic').addEventListener('click', (e) => {
  const t = e.target.closest('.tile');
  if (t) openViewer('city', { theme: t.dataset.theme });
});
daysPromise.then(renderFeatureArt);

// ---------- what you can do: tabs with real snippets ----------
const SITE = location.origin;
const SNIPPETS = {
  embedCode: `<iframe src="${SITE}/embed.html?user=you&style=galaxy"\n  style="width:100%;height:420px;border:0"></iframe>`,
  readmeCode: `[![My year in 3D](${SITE}/api/heatmap?user=you&animate=grow)](${SITE}/studio.html?user=you)`,
  linkCode: `${SITE}/studio.html?user=you&style=night`,
};
const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
// color strings first, then tags (the other order would recolor the quotes in our own spans)
const highlight = (code) =>
  esc(code)
    .replace(/"([^"]*)"/g, '"<span class="s">$1</span>"')
    .replace(/(&lt;\/?iframe)/g, '<span class="k">$1</span>')
    .replace(/\(([^)]*)\)/g, '(<span class="s">$1</span>)');
for (const [id, code] of Object.entries(SNIPPETS)) $(id).innerHTML = id === 'linkCode' ? `<span class="s">${esc(code)}</span>` : highlight(code);
for (const b of document.querySelectorAll('[data-copy]')) {
  b.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(SNIPPETS[b.dataset.copy]);
      b.textContent = 'Copied';
    } catch {
      b.textContent = 'Select to copy';
    }
    setTimeout(() => (b.textContent = 'Copy'), 1400);
  });
}

const useTabs = $('useTabs');
useTabs.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-use]');
  if (!b) return;
  for (const x of useTabs.querySelectorAll('button')) x.setAttribute('aria-selected', x === b);
  for (const p of document.querySelectorAll('.use-panel')) p.classList.toggle('on', p.dataset.use === b.dataset.use);
  moveTabGlider(useTabs);
});

// the README panel shows the real README image, in GitHub's own colors
function renderReadmeArt(days) {
  $('readmeArt').innerHTML = renderSvg(days, { ...defaults(), user: HERO_USER, theme: isLight() ? 'github-light' : 'github', transparent: true });
}
daysPromise.then(renderReadmeArt);

// ---------- explore: Free or Pro, the Pro worlds one at a time ----------
const planToggle = $('planToggle');
planToggle.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-plan]');
  if (!b) return;
  for (const x of planToggle.querySelectorAll('button')) x.setAttribute('aria-selected', x === b);
  for (const v of document.querySelectorAll('.plan-view')) v.classList.toggle('on', v.dataset.plan === b.dataset.plan);
  moveTabGlider(planToggle);
  if (b.dataset.plan === 'pro') syncDots();
});

const slider = $('proSlider');
const slides = [...slider.children];
$('slideDots').innerHTML = slides.map((_, k) => `<button type="button" aria-label="World ${k + 1} of ${slides.length}"></button>`).join('');
const dots = [...$('slideDots').children];
const step = () => slides[1].offsetLeft - slides[0].offsetLeft; // slide width + gap
const current = () => Math.round(slider.scrollLeft / step());
function goTo(k) {
  k = (k + slides.length) % slides.length;
  slider.scrollTo({ left: k * step() });
  markDot(k);
}
const markDot = (k) => dots.forEach((d, i) => d.toggleAttribute('data-on', i === k));
const syncDots = () => markDot(current());
slider.addEventListener('scroll', syncDots, { passive: true });
dots.forEach((d, k) => d.addEventListener('click', () => goTo(k)));
$('slidePrev').addEventListener('click', () => goTo(current() - 1));
$('slideNext').addEventListener('click', () => goTo(current() + 1));
syncDots();
// slides on by itself while in view, until someone touches it
let autoplay = true;
for (const ev of ['pointerdown', 'wheel', 'keydown']) slider.parentElement.addEventListener(ev, () => (autoplay = false), { passive: true });
let sliderVisible = false;
new IntersectionObserver(([e]) => (sliderVisible = e.isIntersecting)).observe(slider);
setInterval(() => {
  if (autoplay && sliderVisible && !player?.playing && !matchMedia('(prefers-reduced-motion: reduce)').matches) goTo(current() + 1);
}, 6000);

function moveTabGlider(group) {
  const on = group.querySelector('[aria-selected="true"]');
  const g = group.querySelector('.seg-glider');
  g.style.width = `${on.offsetWidth}px`;
  g.style.transform = `translateX(${on.offsetLeft}px)`;
}
const tabGroups = [useTabs, planToggle];
addEventListener('resize', () => tabGroups.forEach(moveTabGlider));
document.fonts?.ready.then(() => tabGroups.forEach(moveTabGlider));
tabGroups.forEach(moveTabGlider);

// count numbers up when they scroll into view
const counter = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    counter.unobserve(e.target);
    const to = Number(e.target.dataset.count);
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / 1100);
      e.target.textContent = Math.round(to * (1 - (1 - t) ** 3));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
});
document.querySelectorAll('[data-count]').forEach((el) => counter.observe(el));

// ---------- pricing ----------
const billing = $('billing');
function moveBillingGlider() {
  const on = billing.querySelector('[aria-checked="true"]');
  const g = billing.querySelector('.seg-glider');
  g.style.width = `${on.offsetWidth}px`;
  g.style.transform = `translateX(${on.offsetLeft}px)`;
}
billing.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-bill]');
  if (!b || b.getAttribute('aria-checked') === 'true') return;
  for (const x of billing.querySelectorAll('button')) x.setAttribute('aria-checked', x === b);
  moveBillingGlider();
  yearly = b.dataset.bill === 'year';
  const price = $('proPrice');
  price.classList.add('swap');
  setTimeout(() => {
    renderPricing();
    price.classList.remove('swap');
  }, 180);
});

// Prices read per day, in the visitor's currency; the full amount is always right under them.
let yearly = true;
let country = guessCountry();
function renderPricing() {
  const p = pricesFor(country);
  const m = (n) => money(n, p.currency);
  $('priceFlag').textContent = p.country.flag;
  $('priceCountryName').textContent = p.country.name;
  $('freePrice').textContent = m(0);
  $('proPrice').textContent = m(yearly ? p.perDay.year : p.perDay.month);
  $('proWas').textContent = m(p.perDay.month);
  $('proWas').hidden = !yearly;
  $('proBilled').textContent = yearly ? `${m(p.year)} a year, that’s ${m(p.year / 12)} a month. Cancel anytime.` : `${m(p.month)} a month. Cancel anytime.`;
  $('lifePrice').textContent = `${m(p.life)}, one payment`;
  $('worldPrice').textContent = m(p.world);
}
renderPricing();
$('priceCountry').addEventListener('click', () =>
  openRegionPicker({
    current: country,
    onPick: (code) => {
      country = code;
      renderPricing();
    },
  }),
);
addEventListener('resize', moveBillingGlider);
document.fonts?.ready.then(moveBillingGlider);
moveBillingGlider();

for (const b of document.querySelectorAll('[data-checkout]')) {
  b.addEventListener('click', () => {
    $('checkoutNote').textContent = 'Checkout opens very soon, with Sign in with Google. Until then you can try every world in the Studio for free.';
  });
}

// ---------- account: Sign in in the nav, or the avatar menu (with a PRO mark) once signed in ----------
let navAccount = '';
onAccountChange((a) => {
  const slot = $('navAccount');
  slot.toggleAttribute('data-pro', Boolean(a) && owns('pro'));
  if ((a?.id || '') === navAccount) return;
  navAccount = a?.id || '';
  if (a) {
    slot.innerHTML = '';
    mountAccountButton(slot);
  } else slot.innerHTML = '<button type="button" class="nav-signin" id="navSignIn">Sign in</button>';
});
$('navAccount').addEventListener('click', (e) => {
  if (!e.target.closest('#navSignIn')) return;
  if (!signInAvailable()) return;
  signInWithGoogle().catch(() => {});
});
startAccounts();

suggestDesktop();
