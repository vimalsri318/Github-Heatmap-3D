// GET /api/heatmap?user=octocat&theme=sand → SVG image of the 3D heatmap.
// Made for GitHub READMEs: ![](https://your-site/api/heatmap?user=octocat&animate=grow)
import { parseOptions } from '../src/lib/options.js';
import { sampleContributions } from '../src/lib/data.js';
import { renderSvg, renderMessageSvg } from '../src/lib/svg.js';
import { renderChartSvg, CHART_TYPES } from '../src/lib/charts.js';
import { waitUntil } from '@vercel/functions';
import { getContributions, cacheHeader, clientIp, NotFound } from './_contributions.js';
import { bump, isBot } from './_analytics.js';

export default async function handler(req, res) {
  const params = new URL(req.url, 'http://localhost').searchParams;
  const opts = parseOptions(params);
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  try {
    let days = sampleContributions(opts.year);
    let source = 'sample';
    if (opts.user) ({ days, source } = await getContributions(opts.user, opts.year, { ip: clientIp(req) }));
    // GitHub's image proxy (camo) and our CDN both respect this, so most views never reach us
    res.setHeader('Cache-Control', cacheHeader(opts.year, source));
    res.setHeader('X-Data-Source', source);
    res.statusCode = 200;
    res.end(CHART_TYPES[opts.type] ? renderChartSvg(opts.type, days, opts) : renderSvg(days, opts));
    // Counts renders, not views: the CDN and GitHub's image proxy answer most views without us.
    const ua = req.headers['user-agent'] || '';
    const via = /github-camo/i.test(ua) ? 'github' : isBot(ua) ? 'bot' : 'other';
    if (process.env.DATABASE_URL) waitUntil(bump('image_render', [opts.user || 'sample', opts.type, opts.animate, via].join('|')));
  } catch (err) {
    // an unknown user won't appear soon; anything else is worth asking again shortly
    res.setHeader('Cache-Control', err instanceof NotFound ? 'public, max-age=600, s-maxage=3600' : 'public, max-age=60, s-maxage=60');
    res.statusCode = 200; // still return an image so the README shows the message
    res.end(renderMessageSvg(err.message, opts.theme));
  }
}
