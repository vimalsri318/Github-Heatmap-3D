// Every user-facing setting, its default, and how it is written in a URL.
// The same names are used for URL params (?autoRotate=0), embed script
// attributes (data-auto-rotate="0") and the README image API.
const thisYear = new Date().getFullYear();

export const OPTIONS = {
  user: { type: 'string', default: '' },
  demo: { type: 'bool', default: false }, // show the built-in demo year instead of fetching `user`
  year: { type: 'number', default: thisYear, min: 2008, max: thisYear },
  style: { type: 'string', default: 'city' }, // city, night, galaxy, forest
  theme: { type: 'string', default: 'sand' }, // colors for the City style
  palette: { type: 'string', default: 'spring' }, // leaf colors for the Forest style
  music: { type: 'bool', default: false }, // show a "play your year" button on embeds
  height: { type: 'number', default: 8, min: 2, max: 20 }, // tallest bar, in grid cells
  log: { type: 'bool', default: false }, // log scale so quiet days stay visible
  barSize: { type: 'number', default: 0.82, min: 0.3, max: 1 }, // bar footprint (1 = no gap)
  shadows: { type: 'bool', default: true },
  base: { type: 'bool', default: true }, // plinth under the grid
  labels: { type: 'bool', default: true }, // month + weekday labels
  title: { type: 'bool', default: true }, // "user · year" on the plinth
  autoRotate: { type: 'bool', default: true },
  rotateSpeed: { type: 'number', default: 0.8, min: -5, max: 5 }, // negative = clockwise
  interactive: { type: 'bool', default: true }, // drag / zoom with the mouse
  zoom: { type: 'bool', default: true }, // scroll-wheel zoom (embeds often want this off)
  tooltip: { type: 'bool', default: true },
  tour: { type: 'bool', default: true }, // the tooltip walks through the days by itself until someone points
  transparent: { type: 'bool', default: false }, // no background, for embedding on any page
  camera: { type: 'vec3', default: null }, // saved view, e.g. "-18,32,52"
  badge: { type: 'bool', default: true }, // small "open in 3D" link on embeds
  key: { type: 'string', default: '' }, // proof of purchase for a Pro world in an embed (from /api/embed-key)
  // README image (SVG) only
  type: { type: 'string', default: '3d' }, // 3d, or a 2D design: card, donut, months, calendar
  animate: { type: 'string', default: '0' }, // 3D image only: 0 (still), grow (rise once), loop
  // the camera's angle around and above the board, in degrees
  angle: { type: 'number', default: -20, min: -180, max: 180 },
  tilt: { type: 'number', default: 30, min: 5, max: 85 },
};

// Converts a saved 3D camera position into the README image's angle/tilt.
export function cameraToAngles([x, y, z]) {
  const angle = Math.round((Math.atan2(x, z) * 180) / Math.PI);
  const tilt = Math.round((Math.atan2(y, Math.hypot(x, z)) * 180) / Math.PI);
  return { angle, tilt: Math.min(85, Math.max(5, tilt)) };
}

export function defaults() {
  return Object.fromEntries(Object.entries(OPTIONS).map(([k, o]) => [k, o.default]));
}

function parseValue(spec, raw) {
  if (raw == null) return undefined;
  switch (spec.type) {
    case 'bool':
      return !['0', 'false', 'no', 'off'].includes(String(raw).toLowerCase());
    case 'number': {
      const n = Number(raw);
      if (!Number.isFinite(n)) return undefined;
      return Math.min(spec.max ?? Infinity, Math.max(spec.min ?? -Infinity, n));
    }
    case 'vec3': {
      const v = String(raw).split(',').map(Number);
      return v.length === 3 && v.every(Number.isFinite) ? v : undefined;
    }
    default:
      return String(raw).slice(0, 100);
  }
}

// Accepts URLSearchParams, a DOMStringMap (element.dataset) or a plain object.
export function parseOptions(source) {
  const get = source instanceof URLSearchParams ? (k) => source.get(k) : (k) => source[k];
  const out = defaults();
  for (const [key, spec] of Object.entries(OPTIONS)) {
    const v = parseValue(spec, get(key));
    if (v !== undefined) out[key] = v;
  }
  return out;
}

function formatValue(spec, v) {
  if (spec.type === 'bool') return v ? '1' : '0';
  if (spec.type === 'vec3') return v.map((n) => Math.round(n * 10) / 10).join(',');
  return String(v);
}

// Only writes options that differ from their defaults, so links stay short.
export function toParams(opts, keys = Object.keys(OPTIONS)) {
  const p = new URLSearchParams();
  for (const key of keys) {
    const spec = OPTIONS[key];
    const v = opts[key];
    if (v == null || v === '' || JSON.stringify(v) === JSON.stringify(spec.default)) continue;
    p.set(key, formatValue(spec, v));
  }
  return p;
}
