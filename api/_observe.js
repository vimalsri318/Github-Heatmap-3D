// Logs, traces and metrics for every API route.
//
//   export default observe('heatmap', async (req, res, ctx) => { … ctx.span('render', fn) … })
//
// Each request gets:
//   - a request id and a W3C trace id (X-Request-Id and traceparent response headers),
//     so one request can be followed through Vercel's logs or a log drain
//   - timed spans (cache, upstream, render), returned in the Server-Timing header
//   - one JSON log line when it finishes: route, status, duration, spans, data source, error
//   - metrics: requests by route and status, latency buckets, and any counters the route adds,
//     summed in memory and written to daily_counts about once a minute
import { randomBytes } from 'node:crypto';
import { waitUntil } from '@vercel/functions';
import { db } from './_db.js';

const REGION = process.env.VERCEL_REGION || 'local';
const VERSION = (process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 7);
const quiet = process.env.NODE_ENV === 'test' || process.env.OBSERVE_QUIET === '1';

// ---------- logs ----------
/** One JSON line, so log tools can search and filter by field. */
export function log(level, msg, fields = {}) {
  if (quiet && level !== 'error') return;
  const line = JSON.stringify({ level, msg, time: new Date().toISOString(), region: REGION, version: VERSION, ...fields });
  (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(line);
}

// ---------- metrics ----------
const BUCKETS = [50, 100, 250, 500, 1000, 2500, 5000];
export const bucketOf = (ms) => String(BUCKETS.find((b) => ms <= b) ?? 'slow');
let pending = new Map(); // "kind\u0000key" → n
let lastFlush = Date.now();

/** Adds to a counter that's saved with the next flush (kind and key as in daily_counts). */
export function count(kind, key, n = 1) {
  const k = `${kind}\u0000${String(key).slice(0, 200)}`;
  pending.set(k, (pending.get(k) || 0) + n);
}

/** Writes the counters to the database in one statement. Never throws. */
export async function flushMetrics() {
  if (!pending.size || !process.env.DATABASE_URL) return;
  const batch = pending;
  pending = new Map();
  lastFlush = Date.now();
  const values = [];
  const rows = [...batch].map(([k, n], i) => {
    const [kind, key] = k.split('\u0000');
    values.push(kind, key, n);
    return `(current_date, $${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`;
  });
  try {
    await db().query(
      `insert into daily_counts (day, kind, key, n) values ${rows.join(',')}
       on conflict (day, kind, key) do update set n = daily_counts.n + excluded.n`,
      values,
    );
  } catch (err) {
    log('warn', 'metrics flush failed', { error: err.message, counters: batch.size });
  }
}
const flushSoon = () => (Date.now() - lastFlush > 60_000 || pending.size > 200) && waitUntil(flushMetrics());

// ---------- traces ----------
function traceIds(req) {
  // keep the caller's trace when it sends one (traceparent: 00-<trace>-<span>-<flags>)
  const parent = /^00-([0-9a-f]{32})-[0-9a-f]{16}-[0-9a-f]{2}$/.exec(req.headers?.traceparent || '');
  return { traceId: parent?.[1] || randomBytes(16).toString('hex'), spanId: randomBytes(8).toString('hex') };
}

/** Wraps an API handler with logging, tracing and metrics. */
export function observe(route, handler) {
  return async function observed(req, res) {
    const started = performance.now();
    const { traceId, spanId } = traceIds(req);
    const requestId = String(req.headers?.['x-vercel-id'] || traceId.slice(0, 16));
    const spans = [];
    const ctx = {
      requestId,
      traceId,
      fields: {}, // extra fields for the log line, e.g. { source: 'memory' }
      /** Times `fn` as a named span. */
      async span(name, fn) {
        const t = performance.now();
        try {
          return await fn();
        } finally {
          spans.push([name, performance.now() - t]);
        }
      },
    };

    res.setHeader('X-Request-Id', requestId);
    res.setHeader('traceparent', `00-${traceId}-${spanId}-01`);
    // Server-Timing has to go out with the headers, so add it right before the body is sent
    const end = res.end.bind(res);
    res.end = (...args) => {
      if (!res.headersSent) {
        const timing = [...spans.map(([n, ms]) => `${n};dur=${ms.toFixed(1)}`), `total;dur=${(performance.now() - started).toFixed(1)}`];
        res.setHeader('Server-Timing', timing.join(', '));
      }
      return end(...args);
    };

    let error = null;
    try {
      await handler(req, res, ctx);
    } catch (err) {
      error = err;
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify({ error: 'Something went wrong', requestId }));
      } else if (!res.writableEnded) res.end();
    }

    const ms = performance.now() - started;
    const status = res.statusCode || 200;
    count('api_requests', `${route}|${status}`);
    count('api_latency', `${route}|${bucketOf(ms)}`);
    if (ctx.fields.source) count('data_source', `${route}|${ctx.fields.source}`);
    log(error || status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info', 'request', {
      route,
      method: req.method,
      status,
      ms: Math.round(ms),
      requestId,
      traceId,
      spans: Object.fromEntries(spans.map(([n, d]) => [n, Math.round(d)])),
      country: req.headers?.['x-vercel-ip-country'],
      ...ctx.fields,
      ...(error && { error: error.message, stack: error.stack?.split('\n').slice(0, 5).join(' | ') }),
    });
    flushSoon();
  };
}
