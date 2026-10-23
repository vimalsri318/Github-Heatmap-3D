// Renders the heatmap as a static 3D-style SVG (no WebGL), for places that can
// only show images — like GitHub READMEs. Runs on the server and in the browser.
import { THEMES, getTheme } from './themes.js';
import { computeStats } from './data.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SCALE = 14; // px per grid cell
const MIN_H = 0.08;
const BASE_H = 0.6;
const FONT = '-apple-system, BlinkMacSystemFont, Segoe UI, Helvetica, Arial, sans-serif';

const r1 = (n) => Math.round(n * 10) / 10;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}

export function renderSvg(days, opts) {
  // `colors` (code only, never from a URL) overrides theme colors, e.g. one filament color for a print preview
  const theme = { ...THEMES[getTheme(opts.theme)], ...opts.colors };
  const th = (opts.angle * Math.PI) / 180;
  const ph = (opts.tilt * Math.PI) / 180;
  const [cosT, sinT, sinP, cosP] = [Math.cos(th), Math.sin(th), Math.sin(ph), Math.cos(ph)];

  // Orthographic camera orbiting the board — same conventions as the 3D view.
  const project = (x, y, z) => [(x * cosT - z * sinT) * SCALE, ((x * sinT + z * cosT) * sinP - y * cosP) * SCALE];
  const depth = (x, z) => x * sinT + z * cosT; // larger = closer to the viewer

  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const grow = ([x, y], pad = 0) => {
    bounds.minX = Math.min(bounds.minX, x - pad);
    bounds.maxX = Math.max(bounds.maxX, x + pad);
    bounds.minY = Math.min(bounds.minY, y - pad);
    bounds.maxY = Math.max(bounds.maxY, y + pad);
  };
  const poly = (pts, fill) => {
    pts.forEach((p) => grow(p));
    return `<path d="M${pts.map(([x, y]) => `${r1(x)} ${r1(y)}`).join('L')}Z" fill="${fill}"/>`;
  };

  // A box's visible faces: top, plus whichever x/z sides face the camera.
  function box(x0, x1, y0, y1, z0, z1, color) {
    let out = '';
    const xf = sinT > 0 ? x1 : x0;
    const zf = cosT > 0 ? z1 : z0;
    if (Math.abs(sinT) > 0.01)
      out += poly([project(xf, y0, z0), project(xf, y0, z1), project(xf, y1, z1), project(xf, y1, z0)], shade(color, 0.72));
    if (Math.abs(cosT) > 0.01)
      out += poly([project(x0, y0, zf), project(x1, y0, zf), project(x1, y1, zf), project(x0, y1, zf)], shade(color, 0.86));
    out += poly([project(x0, y1, z0), project(x1, y1, z0), project(x1, y1, z1), project(x0, y1, z1)], color);
    return out;
  }

  // Text lying flat on the board at world (x, 0, z).
  function flatText(text, x, z, { size, color, weight = 500, anchor = 'start' }) {
    const [ex, ey] = project(x, 0.01, z);
    grow([ex, ey], size * SCALE * 2);
    const m = [cosT * SCALE, sinT * sinP * SCALE, -sinT * SCALE, cosT * sinP * SCALE, ex, ey].map((n) => r1(n * 1000) / 1000);
    return `<text transform="matrix(${m.join(' ')})" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}" dominant-baseline="middle">${esc(text)}</text>`;
  }

  // ---- layout (same as the 3D view) ----
  const offset = new Date(days[0].date + 'T00:00:00Z').getUTCDay();
  const cells = days.map((day, i) => ({ day, col: Math.floor((i + offset) / 7), row: (i + offset) % 7 }));
  const cols = cells[cells.length - 1].col + 1;
  const x0 = -cols / 2 + 0.5;
  const z0 = -3.5 + 0.5;
  const half = opts.barSize / 2;
  const max = Math.max(1, ...days.map((d) => d.count));
  const norm = opts.log ? (n) => Math.log1p(n) / Math.log1p(max) : (n) => n / max;
  for (const c of cells) {
    c.x = x0 + c.col;
    c.z = z0 + c.row;
    c.h = c.day.count > 0 ? 0.2 + norm(c.day.count) * opts.height : MIN_H;
  }

  const [px0, px1] = [x0 - 0.5 - 2.2, x0 + cols - 0.5 + 2.2];
  const [pz0, pz1] = [z0 - 0.5 - 2.2, z0 + 7 - 0.5 + 3.2];
  let body = '';

  // ---- plinth + soft shadow ----
  if (opts.base) {
    if (opts.shadows) {
      const foot = [project(px0, -BASE_H, pz0), project(px1, -BASE_H, pz0), project(px1, -BASE_H, pz1), project(px0, -BASE_H, pz1)];
      body += `<path d="M${foot.map(([x, y]) => `${r1(x + 4)} ${r1(y + 8)}`).join('L')}Z" fill="#000" opacity="${theme.dark ? 0.5 : 0.18}" filter="url(#blur)"/>`;
    }
    body += box(px0, px1, -BASE_H, 0, pz0, pz1, theme.plinth);
  }

  // ---- labels behind/beside the bars ----
  if (opts.labels) {
    let lastMonth = -1;
    for (const c of cells) {
      const m = Number(c.day.date.slice(5, 7)) - 1;
      if (m !== lastMonth && c.row === 0) {
        lastMonth = m;
        body += flatText(MONTHS[m], c.x - half, z0 - 1.2, { size: 0.9, color: theme.label });
      }
    }
    for (const [name, row] of [['Mon', 1], ['Wed', 3], ['Fri', 5]])
      body += flatText(name, x0 - 0.8, z0 + row, { size: 0.7, color: theme.label, anchor: 'end' });
  }

  // ---- bars, back to front ----
  const motion = animation(opts.animate, cols);
  const sorted = [...cells].sort((a, b) => depth(a.x, a.z) - depth(b.x, b.z));
  let barsSvg = '';
  let clips = '';
  let clipCount = 0;
  for (const c of sorted) {
    const [bx0, bx1, bz0, bz1] = [c.x - half, c.x + half, c.z - half, c.z + half];
    const faces = box(bx0, bx1, 0, c.h, bz0, bz1, theme.levels[c.day.level]);
    // empty days are flat tiles already, so only days with contributions rise
    if (!motion || c.day.count === 0) {
      barsSvg += faces;
      continue;
    }
    // The bar starts sunk into the board and slides up. Clipping it to its own full-height
    // outline hides the part still below the surface, so it looks like it is growing.
    const corners = [];
    for (const x of [bx0, bx1]) for (const y of [0, c.h]) for (const z of [bz0, bz1]) corners.push(project(x, y, z));
    const id = `c${(clipCount++).toString(36)}`;
    clips += `<clipPath id="${id}"><path d="M${hull(corners).map(([x, y]) => `${r1(x)} ${r1(y)}`).join('L')}Z"/></clipPath>`;
    const sink = r1((c.h - MIN_H) * cosP * SCALE);
    barsSvg += `<g clip-path="url(#${id})"><g>${motion.bar(c.col, c.row, sink)}${faces}</g></g>`;
  }
  body += `${clips ? `<defs>${clips}</defs>` : ''}<g id="bars">${barsSvg}</g>`;
  if (motion) body += SHINE; // filled in once the bounds are known

  // ---- name on the front edge ----
  if (opts.title) {
    const year = days[0].date.slice(0, 4);
    body += flatText(`${opts.user || 'sample'}  ·  ${year}`, x0 - half, z0 + 8, { size: 1.4, color: theme.text, weight: 600 });
  }

  // ---- header ----
  const pad = 20;
  let header = '';
  let headerH = 0;
  if (opts.title) {
    const { total } = computeStats(days);
    headerH = 34;
    header =
      `<text x="${pad}" y="${pad + 14}" font-size="18" font-weight="700" fill="${theme.accent}">${total.toLocaleString('en-US')}` +
      `<tspan font-size="13" font-weight="500" fill="${theme.label}" dx="6">contributions in ${esc(days[0].date.slice(0, 4))}</tspan></text>`;
  }

  const w = Math.ceil(bounds.maxX - bounds.minX + pad * 2);
  const h = Math.ceil(bounds.maxY - bounds.minY + pad * 2 + headerH);
  const tx = r1(pad - bounds.minX);
  const ty = r1(pad + headerH - bounds.minY);
  const bg = opts.transparent ? '' : `<rect width="100%" height="100%" rx="12" fill="${theme.background}"/>`;
  if (motion) body = body.replace(SHINE, motion.shine(bounds, theme));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="${FONT}" role="img" aria-label="${esc(opts.user || 'sample')}'s GitHub contributions in 3D">
<defs><filter id="blur" x="-10%" y="-50%" width="120%" height="200%"><feGaussianBlur stdDeviation="8"/></filter></defs>
${bg}${header}<g transform="translate(${tx} ${ty})">${body}</g>
</svg>`;
}

const SHINE = '<!--shine-->';
const r3 = (n) => Math.round(n * 1000) / 1000;

/** Convex outline of a set of points (monotone chain). */
function hull(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list) => {
    const out = [];
    for (const q of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], q) <= 0) out.pop();
      out.push(q);
    }
    out.pop();
    return out;
  };
  return [...half(p), ...half([...p].reverse())];
}

/** The animation modes the 3D README image knows. Anything else means a still image. */
export const ANIMATIONS = { grow: 'Rise once', loop: 'Rise and fall, on repeat' };
export const getAnimation = (v) => (v === '1' || v === 'true' ? 'grow' : ANIMATIONS[v] ? v : null);

// Animation written into the SVG itself (SMIL), so it plays inside an <img>, GitHub READMEs
// included, where scripts never run. Bars rise in a wave from January to December, then a soft
// light sweeps across the city. Renderers without SMIL just show the finished board.
function animation(mode, cols) {
  mode = getAnimation(String(mode));
  if (!mode) return null;
  const STEP = 0.035; // s between neighbouring weeks
  const RISE = 0.75; // s for one bar to rise
  const wave = (cols - 1) * STEP + 6 * 0.02; // the last bar starts here
  const risen = wave + RISE; // whole board up
  const HOLD = 6;
  const loop = mode === 'loop';
  const T = loop ? risen + HOLD + wave + 0.5 + 0.8 : risen; // one cycle, in seconds
  const ease = '.2 .8 .3 1'; // quick start, soft landing
  const flat = '0 0 1 1';
  const timing = loop ? `dur="${r3(T)}s" repeatCount="indefinite"` : `dur="${r3(T)}s" fill="freeze"`;

  return {
    bar(col, row, sink) {
      const at = col * STEP + row * 0.02;
      const k = [0, at / T, (at + RISE) / T];
      const values = [sink, sink, 0];
      const splines = [flat, ease];
      if (loop) {
        const down = risen + HOLD + at; // fall in the same order they rose
        k.push(down / T, (down + 0.5) / T, 1);
        values.push(0, sink, sink);
        splines.push(flat, '.6 0 .8 .4', flat);
      } else if (k[2] < 0.9999) {
        k.push(1);
        values.push(0);
        splines.push(flat);
      }
      return `<animateTransform attributeName="transform" type="translate" ${timing} calcMode="spline" keyTimes="${k.map((t) => r3(Math.min(1, t))).join(';')}" keySplines="${splines.join(';')}" values="${values.map((v) => `0 ${v}`).join(';')}"/>`;
    },
    // a band of light, drawn only where the bars are (the bars group is the mask)
    shine(b, theme) {
      const band = r3(Math.max(120, (b.maxX - b.minX) * 0.22));
      const sweep = 2.4;
      const from = r3(b.minX - band);
      const to = r3(b.maxX + band);
      const go = '.45 0 .55 1';
      const anim = loop
        ? `dur="${r3(T)}s" repeatCount="indefinite" keyTimes="0;${r3((risen + 0.2) / T)};${r3((risen + 0.2 + sweep) / T)};1" keySplines="${flat};${go};${flat}" values="${from} 0;${from} 0;${to} 0;${to} 0"`
        : `begin="${r3(risen)}s" dur="${sweep + 4}s" repeatCount="indefinite" keyTimes="0;${r3(sweep / (sweep + 4))};1" keySplines="${go};${flat}" values="${from} 0;${to} 0;${to} 0"`;
      const strength = theme.dark ? 0.3 : 0.45;
      return (
        `<defs><linearGradient id="shine-g" gradientUnits="userSpaceOnUse" x1="${-band}" y1="0" x2="0" y2="${r3(band * 0.35)}">` +
        `<stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity="${strength}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
        `<mask id="shine-m" mask-type="alpha" style="mask-type:alpha"><use href="#bars"/></mask></defs>` +
        `<g mask="url(#shine-m)"><g transform="translate(${from} 0)"><animateTransform attributeName="transform" type="translate" calcMode="spline" ${anim}/>` +
        `<rect x="${-band}" y="${r3(b.minY)}" width="${band}" height="${r3(b.maxY - b.minY)}" fill="url(#shine-g)"/></g></g>`
      );
    },
  };
}

export function renderMessageSvg(message, themeId) {
  const theme = THEMES[getTheme(themeId)];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="80" viewBox="0 0 600 80" font-family="${FONT}">
<rect width="100%" height="100%" rx="12" fill="${theme.background}"/>
<text x="300" y="45" text-anchor="middle" font-size="15" fill="${theme.text}">${esc(message)}</text>
</svg>`;
}
