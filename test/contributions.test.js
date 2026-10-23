import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getContributions, fullYear, isUsername, cacheHeader, NotFound, TooMany, _reset } from '../api/_contributions.js';

const YEAR = 2024;
let calls = 0;
const fakeYear = (user, year) => {
  calls++;
  return new Promise((r) => setTimeout(() => r(fullYear([{ date: `${year}-03-01`, count: 5, level: 2 }], year)), 20));
};

// stands in for Vercel's Runtime Cache, shared by all instances
let store;
const sharedStore = () => ({ get: async (k) => store.get(k) ?? null, set: async (k, v) => void store.set(k, v) });

beforeEach(() => {
  calls = 0;
  store = new Map();
  _reset(fakeYear, sharedStore());
});

test('usernames', () => {
  for (const ok of ['octocat', 'a', 'my-name', 'A1-b2', 'x'.repeat(39)]) assert.ok(isUsername(ok), ok);
  for (const bad of ['', '-a', 'a-', 'a--b', 'a b', 'x'.repeat(40), '../etc', 'a/b', null]) assert.ok(!isUsername(bad), String(bad));
});

test('unknown-looking usernames never reach the source', async () => {
  await assert.rejects(getContributions('../../etc', YEAR), NotFound);
  assert.equal(calls, 0);
});

test('fills the whole year, leap years too', () => {
  assert.equal(fullYear([], 2024).length, 366);
  assert.equal(fullYear([], 2025).length, 365);
  assert.equal(fullYear([{ date: '2025-01-02', count: 3, level: 1 }], 2025)[1].count, 3);
});

test('1,000 people asking at once cost one upstream fetch', async () => {
  const results = await Promise.all(Array.from({ length: 1000 }, () => getContributions('octocat', YEAR)));
  assert.equal(calls, 1);
  assert.ok(results.every((r) => r.days.length === 366));
  assert.equal(results.filter((r) => r.source === 'upstream').length, 1);
  assert.equal(results.filter((r) => r.source === 'joined').length, 999);
});

test('second request comes from memory; usernames are case-insensitive', async () => {
  await getContributions('octocat', YEAR);
  const again = await getContributions('OctoCat', YEAR);
  assert.equal(again.source, 'memory');
  assert.equal(calls, 1);
});

test('different years are different entries', async () => {
  await getContributions('octocat', 2023);
  await getContributions('octocat', 2024);
  assert.equal(calls, 2);
});

test('missing users are remembered, so typos cannot hammer the source', async () => {
  _reset(async () => {
    calls++;
    throw new NotFound('User "nobody" not found');
  });
  await assert.rejects(getContributions('nobody', YEAR), NotFound);
  await assert.rejects(getContributions('nobody', YEAR), NotFound);
  assert.equal(calls, 1);
});

test('when the source fails, an old copy is served instead of an error', async (t) => {
  await getContributions('octocat', YEAR);
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() + 8 * 24 * 3600 * 1000 }); // over a week later: no longer fresh
  _reset(async () => {
    throw new Error('upstream down');
  }); // new instance: empty memory, same shared cache
  const r = await getContributions('octocat', YEAR);
  assert.equal(r.source, 'stale');
  assert.equal(r.days.length, 366);
});

test('a new instance reads what another instance fetched', async () => {
  await getContributions('octocat', YEAR);
  _reset(fakeYear);
  assert.equal((await getContributions('octocat', YEAR)).source, 'shared');
  assert.equal(calls, 1);
});

test('with nothing cached, a source failure is reported', async () => {
  _reset(async () => {
    throw new Error('upstream down');
  });
  await assert.rejects(getContributions('octocat', YEAR), /upstream down/);
});

test('limits uncached lookups per visitor, but cached ones stay free', async () => {
  const ip = '203.0.113.9';
  for (let i = 0; i < 30; i++) await getContributions(`user${i}`, YEAR, { ip });
  await assert.rejects(getContributions('user-new', YEAR, { ip }), TooMany);
  await getContributions('user3', YEAR, { ip }); // already cached: still fine
  await getContributions('user-new', YEAR, { ip: '198.51.100.1' }); // someone else: fine
});

test('cache headers: past years for a week, this year hourly', () => {
  assert.match(cacheHeader(2020, 'upstream'), /s-maxage=604800/);
  assert.match(cacheHeader(new Date().getUTCFullYear(), 'upstream'), /s-maxage=3600/);
  assert.match(cacheHeader(2020, 'stale'), /s-maxage=300/);
});
