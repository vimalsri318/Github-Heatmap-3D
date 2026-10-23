import { test } from 'node:test';
import assert from 'node:assert/strict';
import { observe, bucketOf } from '../api/_observe.js';

process.env.OBSERVE_QUIET = '1';

function fakeRes() {
  return {
    statusCode: 200,
    headers: {},
    headersSent: false,
    writableEnded: false,
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
    },
    end(body) {
      this.headersSent = true;
      this.writableEnded = true;
      this.body = body;
    },
  };
}

test('every response gets a request id, a trace and timings', async () => {
  const handler = observe('demo', async (req, res, ctx) => {
    await ctx.span('work', () => new Promise((r) => setTimeout(r, 15)));
    res.end('ok');
  });
  const res = fakeRes();
  await handler({ method: 'GET', headers: {} }, res);
  assert.match(res.headers['x-request-id'], /^[0-9a-f]{16}$/);
  assert.match(res.headers.traceparent, /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
  assert.match(res.headers['server-timing'], /work;dur=\d+(\.\d)?, total;dur=/);
  assert.ok(Number(/work;dur=([\d.]+)/.exec(res.headers['server-timing'])[1]) >= 10);
});

test("keeps the caller's trace id, and Vercel's request id", async () => {
  const trace = '4bf92f3577b34da6a3ce929d0e0e4736';
  const res = fakeRes();
  await observe('demo', async (req, r) => r.end())({ method: 'GET', headers: { traceparent: `00-${trace}-00f067aa0ba902b7-01`, 'x-vercel-id': 'bom1::abc' } }, res);
  assert.ok(res.headers.traceparent.startsWith(`00-${trace}-`));
  assert.equal(res.headers['x-request-id'], 'bom1::abc');
});

test('a crash becomes a 500 with the request id, not a hung request', async () => {
  const res = fakeRes();
  await observe('demo', async () => {
    throw new Error('boom');
  })({ method: 'GET', headers: {} }, res);
  assert.equal(res.statusCode, 500);
  const body = JSON.parse(res.body);
  assert.equal(body.error, 'Something went wrong');
  assert.equal(body.requestId, res.headers['x-request-id']);
  assert.doesNotMatch(res.body, /boom/); // internals stay in the logs
});

test('latency buckets', () => {
  assert.equal(bucketOf(3), '50');
  assert.equal(bucketOf(50), '50');
  assert.equal(bucketOf(51), '100');
  assert.equal(bucketOf(4000), '5000');
  assert.equal(bucketOf(9000), 'slow');
});
