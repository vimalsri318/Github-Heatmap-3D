// GET /api/contributions?user=octocat&year=2025 → [{ date, count, level }, …] for the whole year.
// The 3D embeds and the Studio load their data from here, so every visitor shares our cache
// instead of each browser asking the upstream source itself.
import { getContributions, cacheHeader, clientIp, NotFound, TooMany } from './_contributions.js';
import { OPTIONS } from '../src/lib/options.js';

export default async function handler(req, res) {
  const q = new URL(req.url, 'http://x').searchParams;
  const { min, max } = OPTIONS.year;
  const year = Math.min(max, Math.max(min, Number(q.get('year')) || max));
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const { days, source } = await getContributions(q.get('user'), year, { ip: clientIp(req) });
    res.setHeader('Cache-Control', cacheHeader(year, source));
    res.setHeader('X-Data-Source', source);
    res.statusCode = 200;
    res.end(JSON.stringify(days));
  } catch (err) {
    const status = err instanceof NotFound ? 404 : err instanceof TooMany ? 429 : 502;
    res.setHeader('Cache-Control', status === 404 ? 'public, max-age=600, s-maxage=3600' : 'no-store');
    if (status === 429) res.setHeader('Retry-After', '60');
    res.statusCode = status;
    res.end(JSON.stringify({ error: err.message }));
  }
}
