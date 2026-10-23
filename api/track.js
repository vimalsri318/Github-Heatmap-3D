// POST /api/track ← the pages' analytics beacon: { session, events: [{ name, page, props, ref }] }
// Anonymous: no cookies, and the IP is only used to make a daily visitor hash, never stored.
import { isBot, device, visitorId, referrerHost, insertEvents } from './_analytics.js';
import { clientIp } from './_contributions.js';

const NAME = /^[a-z][a-z0-9_]{0,39}$/;
const MAX_EVENTS = 30;
const PER_MINUTE = 120; // events per IP per instance
const seen = new Map();

function allow(ip, n) {
  const minute = Math.floor(Date.now() / 60000);
  const s = seen.get(ip);
  const count = (s?.minute === minute ? s.count : 0) + n;
  seen.set(ip, { minute, count });
  if (seen.size > 5000) seen.clear();
  return count <= PER_MINUTE;
}

/** Keeps props small and flat: up to 12 short string/number/boolean values. */
function cleanProps(p) {
  const out = {};
  if (!p || typeof p !== 'object') return out;
  for (const [k, v] of Object.entries(p).slice(0, 12)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,29}$/.test(k)) continue;
    if (typeof v === 'string') out[k] = v.slice(0, 120);
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
    else if (typeof v === 'boolean') out[k] = v;
  }
  return out;
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body; // Vercel parsed it already
  let raw = typeof req.body === 'string' ? req.body : '';
  if (!raw) for await (const chunk of req) if ((raw += chunk).length > 32_000) break;
  return JSON.parse(raw);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const done = (status) => ((res.statusCode = status), res.end());
  if (req.method !== 'POST') return done(405);
  const ua = req.headers['user-agent'] || '';
  if (isBot(ua)) return done(204);

  let body;
  try {
    body = await readBody(req);
  } catch {
    return done(400);
  }
  const events = Array.isArray(body?.events) ? body.events.slice(0, MAX_EVENTS) : [];
  const ip = clientIp(req) || 'unknown';
  if (!events.length) return done(204);
  if (!allow(ip, events.length)) return done(429);

  const ownHost = (req.headers.host || '').split(':')[0].replace(/^www\./, '');
  const common = {
    visitor: visitorId(ip, ua),
    session: typeof body.session === 'string' ? body.session.slice(0, 32) : null,
    country: String(req.headers['x-vercel-ip-country'] || '').slice(0, 2) || null,
    device: device(ua),
  };
  const rows = events
    .filter((e) => e && NAME.test(e.name))
    .map((e) => ({
      ...common,
      name: e.name,
      page: typeof e.page === 'string' ? e.page.slice(0, 100) : null,
      referrer: referrerHost(e.ref, ownHost),
      props: cleanProps(e.props),
    }));
  try {
    await insertEvents(rows);
    done(204);
  } catch (err) {
    console.error('api/track', err.message);
    done(503);
  }
}
