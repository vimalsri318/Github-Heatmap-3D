// A user's contribution year, fetched once and shared by every request that needs it.
//
// Many people can show the same user's heatmap (READMEs, iframes, every theme and angle),
// but the data behind it is the same few KB. So everything goes through here:
//   1. memory on this function instance (instant)
//   2. Vercel's Runtime Cache, shared by all instances in the region
//   3. only then GitHub data, with one fetch per user+year at a time however many ask at once
// Past years never change, so they're kept for a week. This year is refreshed hourly, and when
// the source is down or rate limited we keep serving the last copy instead of failing.
import { getCache } from '@vercel/functions';
import { log, count } from './_observe.js';

const JOGRUBER = 'https://github-contributions-api.jogruber.de/v4';
const GITHUB_GRAPHQL = 'https://api.github.com/graphql';
const HOUR = 3600;
const KEEP = 7 * 24 * HOUR; // how long a copy may be served when the source is unavailable
const TIMEOUT_MS = 8000;

// GitHub usernames: letters, digits and single hyphens, not at the ends, up to 39 characters
export const isUsername = (u) => typeof u === 'string' && /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(u);

export class NotFound extends Error {}

const now = () => Math.floor(Date.now() / 1000);
const thisYear = () => new Date().getUTCFullYear();
/** Seconds a copy counts as fresh. */
export const freshFor = (year) => (year < thisYear() ? KEEP : HOUR);

// ---------- layer 1: this instance's memory (small LRU) ----------
const memory = new Map();
const MEMORY_MAX = 500;
function remember(key, entry) {
  memory.delete(key);
  memory.set(key, entry);
  if (memory.size > MEMORY_MAX) memory.delete(memory.keys().next().value);
}

// ---------- layer 2: Vercel Runtime Cache (falls back to memory outside Vercel) ----------
let shared;
function sharedCache() {
  if (shared === undefined) {
    try {
      shared = getCache({ namespace: 'contrib-v1' });
    } catch {
      shared = null;
    }
  }
  return shared;
}
async function sharedGet(key) {
  try {
    return (await sharedCache()?.get(key)) ?? null;
  } catch (err) {
    log('warn', 'shared cache read failed', { error: err.message });
    return null;
  }
}
async function sharedSet(key, entry) {
  try {
    await sharedCache()?.set(key, entry, { ttl: KEEP, tags: [`user:${key.split(':')[0]}`] });
  } catch (err) {
    log('warn', 'shared cache write failed', { error: err.message });
  }
}

// ---------- layer 3: the sources ----------
const LEVELS = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };

/** Official GitHub GraphQL API. Needs GITHUB_TOKEN (any token, no scopes): 5,000 points an hour. */
async function fromGitHub(user, year) {
  const query = `query($login:String!,$from:DateTime!,$to:DateTime!){user(login:$login){contributionsCollection(from:$from,to:$to){contributionCalendar{weeks{contributionDays{date contributionCount contributionLevel}}}}}}`;
  const res = await fetch(GITHUB_GRAPHQL, {
    method: 'POST',
    headers: { Authorization: `bearer ${process.env.GITHUB_TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': 'github-heatmap-3d' },
    body: JSON.stringify({ query, variables: { login: user, from: `${year}-01-01T00:00:00Z`, to: `${year}-12-31T23:59:59Z` } }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);
  const json = await res.json();
  if (json.data && json.data.user === null) throw new NotFound(`User "${user}" not found`);
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data.user.contributionsCollection.contributionCalendar.weeks
    .flatMap((w) => w.contributionDays)
    .map((d) => ({ date: d.date, count: d.contributionCount, level: LEVELS[d.contributionLevel] ?? 0 }));
}

/** Public scraper of the profile calendar. No token, but shared with everyone who uses it. */
async function fromJogruber(user, year) {
  const res = await fetch(`${JOGRUBER}/${encodeURIComponent(user)}?y=${year}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (res.status === 404) throw new NotFound(`User "${user}" not found`);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json.contributions;
}

/** Every day of the year, Jan 1 to Dec 31, whatever the source returned. */
export function fullYear(days, year) {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const out = [];
  for (const d = new Date(Date.UTC(year, 0, 1)); d.getUTCFullYear() === year; d.setUTCDate(d.getUTCDate() + 1)) {
    const date = d.toISOString().slice(0, 10);
    const day = byDate.get(date);
    out.push({ date, count: day?.count ?? 0, level: day?.level ?? 0 });
  }
  return out;
}

async function fetchFresh(user, year) {
  // the official API first when we have a token; the other source covers for it
  const sources = process.env.GITHUB_TOKEN ? [fromGitHub, fromJogruber] : [fromJogruber];
  let lastError;
  for (const source of sources) {
    const t = performance.now();
    try {
      const days = fullYear(await source(user, year), year);
      count('upstream', `${source.name}|ok`);
      log('info', 'upstream fetch', { source: source.name, user, year, ms: Math.round(performance.now() - t) });
      return days;
    } catch (err) {
      if (err instanceof NotFound) {
        count('upstream', `${source.name}|not_found`);
        throw err;
      }
      lastError = err;
      count('upstream', `${source.name}|error`);
      log('warn', 'upstream fetch failed', { source: source.name, user, year, ms: Math.round(performance.now() - t), error: err.message });
    }
  }
  throw lastError;
}

// ---------- putting it together ----------
const inFlight = new Map(); // one upstream fetch per key at a time

let upstream = fetchFresh;
/** For tests: swap the sources and the shared cache, and forget this instance's memory. */
export function _reset(source = fetchFresh, sharedStore) {
  upstream = source;
  if (sharedStore !== undefined) shared = sharedStore;
  memory.clear();
  inFlight.clear();
  misses.clear();
}

// ---------- fair use: uncached lookups per visitor ----------
// Cached answers are free and unlimited. Lookups that must go to GitHub are limited per IP on
// each instance, so cycling through random usernames can't burn the shared quota.
// (For a hard, global limit add a Vercel Firewall rate-limit rule as well.)
const misses = new Map();
const MISS_LIMIT = 30; // per minute
export class TooMany extends Error {}
function allowMiss(ip) {
  if (!ip) return true;
  const minute = Math.floor(Date.now() / 60000);
  const seen = misses.get(ip);
  const n = seen?.minute === minute ? seen.n + 1 : 1;
  misses.set(ip, { minute, n });
  if (misses.size > 5000) misses.clear();
  return n <= MISS_LIMIT;
}

/**
 * Contributions for user+year: { days, fetchedAt, source } where source is
 * 'memory' | 'shared' | 'upstream' (this call fetched it) | 'joined' (waited on another call's
 * fetch) | 'stale' (served an old copy because the source failed).
 * Throws NotFound for unknown users and TooMany when this visitor made too many new lookups.
 */
export async function getContributions(user, year, { ip } = {}) {
  if (!isUsername(user)) {
    count('protection', 'invalid_username');
    throw new NotFound(`"${String(user).slice(0, 40)}" isn't a GitHub username`);
  }
  const key = `${user.toLowerCase()}:${year}`;
  const fresh = (e) => e?.days && now() - e.fetchedAt < freshFor(year);

  let entry = memory.get(key);
  if (fresh(entry)) return { ...entry, source: 'memory' };

  const fromShared = await sharedGet(key);
  if (fromShared && (!entry || fromShared.fetchedAt > entry.fetchedAt)) entry = fromShared;
  if (fresh(entry)) {
    remember(key, entry);
    return { ...entry, source: 'shared' };
  }

  if (entry?.missing && now() - entry.fetchedAt < HOUR) throw new NotFound(entry.missing);

  let pending = inFlight.get(key);
  const joined = Boolean(pending);
  if (!pending) {
    if (!allowMiss(ip)) {
      count('protection', 'lookup_rate_limited');
      log('warn', 'uncached lookups rate limited', { user, year });
      if (entry?.days) return { ...entry, source: 'stale' };
      throw new TooMany('Too many new lookups, try again in a minute');
    }
    pending = (async () => {
      try {
        const next = { days: await upstream(user, year), fetchedAt: now() };
        remember(key, next);
        await sharedSet(key, next);
        return next;
      } catch (err) {
        if (err instanceof NotFound) {
          // remember a missing user for a while too, so typos can't hammer the source
          const miss = { missing: err.message, fetchedAt: now() };
          remember(key, miss);
          await sharedSet(key, miss);
        }
        throw err;
      } finally {
        inFlight.delete(key);
      }
    })();
    inFlight.set(key, pending);
  }

  try {
    return { ...(await pending), source: joined ? 'joined' : 'upstream' };
  } catch (err) {
    if (entry?.days && !(err instanceof NotFound)) {
      count('protection', 'served_stale');
      log('warn', 'served a stale copy', { user, year, age_s: now() - entry.fetchedAt, error: err.message });
      return { ...entry, source: 'stale' };
    }
    throw err;
  }
}

/** The visitor's IP as Vercel reports it. */
export const clientIp = (req) => String(req.headers?.['x-real-ip'] || req.headers?.['x-forwarded-for'] || '').split(',')[0].trim();

/** Cache-Control for responses built from this data: browsers and the CDN both keep it. */
export function cacheHeader(year, source) {
  if (source === 'stale') return 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600';
  const ttl = freshFor(year);
  return `public, max-age=${Math.min(ttl, HOUR)}, s-maxage=${ttl}, stale-while-revalidate=${KEEP}`;
}
