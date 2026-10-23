// Server side of the analytics: turns a request into anonymous visitor facts and stores events.
import { createHash } from 'node:crypto';
import { db } from './_db.js';
import { log } from './_observe.js';

const BOTS = /bot|crawl|spider|slurp|preview|headless|lighthouse|pingdom|uptime|curl|wget|python|node-fetch|axios|go-http/i;
export const isBot = (ua = '') => !ua || BOTS.test(ua);

export function device(ua = '') {
  if (/ipad|tablet|kindle|silk/i.test(ua)) return 'tablet';
  if (/mobi|iphone|android/i.test(ua)) return 'mobile';
  return 'desktop';
}

/** Same person, same day → same id. Next day it changes, and it can't be turned back into an IP. */
export function visitorId(ip, ua, day = new Date().toISOString().slice(0, 10)) {
  const salt = process.env.ANALYTICS_SALT || process.env.EMBED_SECRET || 'dev'; // EMBED_SECRET: older deployments
  return createHash('sha256').update(`${salt}|${day}|${ip}|${ua}`).digest('base64url').slice(0, 16);
}

/** Just the host of a referrer URL, and nothing for our own pages. */
export function referrerHost(ref, ownHost) {
  try {
    const host = new URL(ref).hostname.replace(/^www\./, '');
    return host && host !== ownHost ? host : null;
  } catch {
    return null;
  }
}

/** Adds to a daily counter. Never throws: analytics must not break the thing being counted. */
export async function bump(kind, key, n = 1) {
  try {
    await db().query(
      `insert into daily_counts (day, kind, key, n) values (current_date, $1, $2, $3)
       on conflict (day, kind, key) do update set n = daily_counts.n + excluded.n`,
      [kind, String(key).slice(0, 200), n],
    );
  } catch (err) {
    log('warn', 'analytics: count failed', { error: err.message });
  }
}

/** Stores a batch of already-checked events in one query. */
export async function insertEvents(rows) {
  if (!rows.length) return;
  const cols = ['name', 'page', 'visitor', 'session', 'referrer', 'country', 'device', 'props'];
  const values = [];
  const params = rows.map((r, i) => {
    values.push(...cols.map((c) => (c === 'props' ? JSON.stringify(r.props || {}) : (r[c] ?? null))));
    return `(${cols.map((_, j) => `$${i * cols.length + j + 1}`).join(',')})`;
  });
  await db().query(`insert into events (${cols.join(',')}) values ${params.join(',')}`, values);
}
