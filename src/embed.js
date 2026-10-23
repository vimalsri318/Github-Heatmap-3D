// Bare 3D heatmap for iframes: /embed.html?user=octocat&theme=ocean
import { createHeatmap } from './lib/heatmap.js';
import { THEMES, getTheme } from './lib/themes.js';
import { OPTIONS, parseOptions, toParams } from './lib/options.js';
import { STYLES, getStyle } from './lib/styles/index.js';
import { composeSong, createSongPlayer } from './lib/song.js';
import { startTracking, track } from './lib/track.js';

const params = new URLSearchParams(location.search);
const opts = parseOptions(params);
const $ = (id) => document.getElementById(id);

// Pro worlds (and hiding the badge) need a key from a paid account, checked by our server
// on every load. Without one the embed shows the free City with a small note instead.
const pro = STYLES[getStyle(opts.style)].pro;
let unlocked = false;
if (pro || !opts.badge) {
  try {
    const item = pro ? getStyle(opts.style) : 'pro';
    const res = await fetch(`/api/embed-check?${new URLSearchParams({ item, key: opts.key })}`);
    unlocked = res.ok && (await res.json()).ok;
  } catch {}
  if (!unlocked) {
    if (pro) {
      opts.style = 'city';
      $('locked').hidden = false;
    }
    opts.badge = true;
  }
}

const theme = THEMES[STYLES[getStyle(opts.style)].theme || getTheme(opts.theme)];

if (!opts.transparent) document.body.style.background = theme.background;
$('message').style.color = theme.text;

// an embed's page view says which site it's on (the iframe's referrer is the host page)
startTracking({ embed: true });
track('embed_view', { user: opts.user.toLowerCase(), style: opts.style, pro, unlocked });

const map = createHeatmap($('map'), opts);
if (import.meta.env.DEV) window.__heatmap = map; // for debugging and capturing previews
map.on('loading', () => ($('message').textContent = 'Loading…'));
map.on('load', ({ days, user }) => {
  $('message').textContent = '';
  if (opts.music) setupMusic(days, user);
});

// optional "play your year" button
let player = null;
function setupMusic(days, user) {
  player?.destroy();
  const song = composeSong(days, user);
  const btn = $('music');
  const label = () => `${player?.playing ? '❚❚' : '▶'}  ${song.title}`;
  player = createSongPlayer(song, {
    onStep: (i) => map.highlight(i),
    onState: () => (btn.textContent = label()),
    onEnd: () => map.highlight(-1),
  });
  btn.textContent = label();
  btn.style.background = theme.accent;
  btn.style.color = theme.dark ? theme.background : '#fff';
  btn.hidden = false;
  btn.onclick = () => (player.playing ? player.pause() : player.play());
}
map.on('error', (err) => ($('message').textContent = err.message));

if (opts.badge) {
  const badge = $('badge');
  const keys = Object.keys(OPTIONS).filter((k) => k !== 'badge');
  badge.href = `${location.origin}/studio.html?${toParams(opts, keys)}`;
  // on a transparent embed we can't know the host page's colors, so stay neutral
  badge.style.color = opts.transparent ? '#888' : theme.text;
  badge.style.background = opts.transparent ? 'rgba(128,128,128,0.12)' : theme.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';
  badge.hidden = false;
}
