// Analytics against a real Postgres. Skipped unless TEST_DATABASE_URL points at a throwaway
// database that has the migrations applied (never production: it deletes events).
//   TEST_DATABASE_URL=postgresql://localhost/heatmap_test npm test
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { visitorId, device, referrerHost, isBot } from '../api/_analytics.js';

const url = process.env.TEST_DATABASE_URL;

test('visitor ids: same person same day match, next day they change', () => {
  assert.equal(visitorId('1.2.3.4', 'ua', '2026-01-01'), visitorId('1.2.3.4', 'ua', '2026-01-01'));
  assert.notEqual(visitorId('1.2.3.4', 'ua', '2026-01-01'), visitorId('1.2.3.4', 'ua', '2026-01-02'));
  assert.notEqual(visitorId('1.2.3.4', 'ua', '2026-01-01'), visitorId('1.2.3.5', 'ua', '2026-01-01'));
  assert.doesNotMatch(visitorId('1.2.3.4', 'ua'), /1\.2\.3\.4/);
});

test('devices, referrers and bots', () => {
  assert.equal(device('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile'), 'mobile');
  assert.equal(device('Mozilla/5.0 (iPad; CPU OS 17_0)'), 'tablet');
  assert.equal(device('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'), 'desktop');
  assert.equal(referrerHost('https://www.github.com/octocat', 'myapp.com'), 'github.com');
  assert.equal(referrerHost('https://myapp.com/studio.html', 'myapp.com'), null);
  assert.equal(referrerHost('', 'myapp.com'), null);
  assert.ok(isBot('Googlebot/2.1'));
  assert.ok(isBot(''));
  assert.ok(!isBot('Mozilla/5.0 (Macintosh)'));
});

const post = (body, headers = {}) => {
  const req = Readable.from([JSON.stringify(body)]);
  Object.assign(req, { method: 'POST', headers: { host: 'myapp.com', 'user-agent': 'Mozilla/5.0 (Macintosh)', 'x-real-ip': '203.0.113.7', 'x-vercel-ip-country': 'IN', ...headers } });
  return req;
};
const call = async (handler, req) => {
  const res = { statusCode: 0, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } };
  await handler(req, res);
  return res;
};

test('tracking and the admin numbers, end to end', { skip: !url && 'set TEST_DATABASE_URL to run' }, async () => {
  process.env.DATABASE_URL = url;
  const { db } = await import('../api/_db.js');
  process.env.OBSERVE_QUIET = '1';
  await db().query('delete from events; delete from daily_counts');
  const { default: track } = await import('../api/track.js');
  const { collectStats } = await import('../api/admin-stats.js');
  const { bump } = await import('../api/_analytics.js');
  const { count, flushMetrics } = await import('../api/_observe.js');

  const session = 'abc123';
  let r = await call(track, post({ session, events: [
    { name: 'pageview', page: '/', ref: 'https://news.ycombinator.com/item?id=1', props: { width: 1440, source: 'hn' } },
    { name: 'click', page: '/', props: { label: 'Open the Studio', id: 'cta' } },
    { name: 'pageview', page: '/studio.html', ref: 'https://myapp.com/' },
    { name: 'load_user', page: '/studio.html', props: { user: 'octocat', style: 'city' } },
    { name: 'click', page: '/studio.html', props: { label: 'Share & embed', id: 'openDrawer' } },
    { name: 'copy_code', page: '/studio.html', props: { dest: 'readme', user: 'octocat' } },
    { name: 'BAD NAME', page: '/' },
  ] }));
  assert.equal(r.statusCode, 204);

  // an embed on someone's blog, from a phone
  r = await call(track, post({ session: 'emb1', events: [
    { name: 'pageview', page: '/embed.html', ref: 'https://blog.example.org/about', props: { embed: true } },
    { name: 'embed_view', page: '/embed.html', ref: 'https://blog.example.org/about', props: { user: 'torvalds', style: 'galaxy' } },
  ] }, { 'user-agent': 'Mozilla/5.0 (iPhone) Mobile', 'x-real-ip': '198.51.100.2', 'x-vercel-ip-country': 'US' }));
  assert.equal(r.statusCode, 204);

  // bots are ignored, junk is refused
  assert.equal((await call(track, post({ events: [{ name: 'pageview', page: '/' }] }, { 'user-agent': 'Googlebot' }))).statusCode, 204);
  const junk = Readable.from(['{not json']);
  Object.assign(junk, { method: 'POST', headers: { 'user-agent': 'Mozilla/5.0' } });
  assert.equal((await call(track, junk)).statusCode, 400);

  await bump('image_render', 'octocat|3d|grow|github', 3);
  await bump('image_render', 'octocat|3d|grow|github', 2);

  count('api_requests', 'heatmap|200', 9);
  count('api_requests', 'heatmap|500', 1);
  count('api_latency', 'heatmap|100', 10);
  count('upstream', 'fromGitHub|ok', 2);
  await flushMetrics();

  const { rows } = await db().query('select name, props from events order by id');
  assert.equal(rows.length, 8); // 6 good + 2 embed; the bad name and the bot were dropped
  assert.ok(rows.every((x) => !JSON.stringify(x).includes('203.0.113.7')), 'no IP stored');

  const s = await collectStats(7);
  assert.equal(s.totals.visitors, 1); // the embed viewer isn't a site visitor
  assert.equal(s.totals.views, 2);
  assert.equal(s.totals.embed_views, 1);
  assert.equal(s.totals.embed_sites, 1);
  assert.equal(s.totals.copies, 1);
  assert.deepEqual(s.funnel, { visits: 1, studio: 1, loaded: 1, shared: 1, copied: 1 });
  assert.equal(s.referrers[0].key, 'news.ycombinator.com');
  assert.equal(s.embedSites[0].key, 'blog.example.org');
  assert.equal(s.campaigns[0].key, 'hn');
  assert.equal(s.renders.total, 5);
  assert.equal(s.readmeUsers[0].key, 'octocat');
  assert.equal(s.daily.length, 7);
  assert.equal(s.daily.at(-1).visitors, 1);
  assert.equal(s.countries[0].key, 'IN');
  assert.ok(s.clicks.some((c) => c.key === 'Share & embed'));
  const heat = s.api.find((r) => r.route === 'heatmap');
  assert.ok(heat.requests >= 10 && heat.errors >= 1, JSON.stringify(heat));
  assert.ok(s.upstream.some((u) => u.key === 'fromGitHub|ok'));
  assert.ok(s.latency.some((l) => l.route === 'heatmap' && l.bucket === '100'));
  assert.ok(s.daily.at(-1).api >= 10);
  await db().end();
});
