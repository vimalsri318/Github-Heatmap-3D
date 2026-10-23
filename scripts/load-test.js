// Fires many requests at the heatmap API and reports how it held up.
//   npm run load-test -- http://localhost:5173 --requests 500 --concurrency 50 --users octocat,torvalds
// Point it at your deployed site to see the CDN at work (x-vercel-cache: HIT).
// Only load-test servers you own.
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const base = (args.find((a) => /^https?:\/\//.test(a)) || 'http://localhost:5173').replace(/\/$/, '');
const total = Number(flag('requests', 300));
const concurrency = Number(flag('concurrency', 30));
const users = flag('users', 'octocat,torvalds,gaearon').split(',');
const paths = ['/api/contributions?user={u}', '/api/heatmap?user={u}', '/api/heatmap?user={u}&animate=grow', '/api/heatmap?user={u}&theme=ocean&animate=loop'];

const results = [];
let next = 0;
async function worker() {
  while (next < total) {
    const i = next++;
    const url = base + paths[i % paths.length].replace('{u}', users[i % users.length]);
    const t0 = performance.now();
    try {
      const res = await fetch(url);
      const body = await res.arrayBuffer();
      results.push({ status: res.status, ms: performance.now() - t0, bytes: body.byteLength, source: res.headers.get('x-data-source') || '-', cdn: res.headers.get('x-vercel-cache') || '-' });
    } catch (err) {
      results.push({ status: 'error', ms: performance.now() - t0, bytes: 0, source: err.cause?.code || err.message, cdn: '-' });
    }
  }
}

const started = performance.now();
await Promise.all(Array.from({ length: concurrency }, worker));
const secs = (performance.now() - started) / 1000;

const ms = results.map((r) => r.ms).sort((a, b) => a - b);
const pct = (p) => ms[Math.min(ms.length - 1, Math.floor(p * ms.length))].toFixed(0);
const tally = (key) => Object.entries(results.reduce((m, r) => ((m[r[key]] = (m[r[key]] || 0) + 1), m), {})).map(([k, n]) => `${k}: ${n}`).join(', ');

console.log(`\n${base}  ·  ${total} requests, ${concurrency} at a time, ${users.length} users`);
console.log(`  ${(total / secs).toFixed(0)} req/s over ${secs.toFixed(1)}s`);
console.log(`  latency  p50 ${pct(0.5)} ms · p95 ${pct(0.95)} ms · p99 ${pct(0.99)} ms · max ${ms.at(-1).toFixed(0)} ms`);
console.log(`  status   ${tally('status')}`);
console.log(`  data     ${tally('source')}   (only "upstream" ones reached GitHub)`);
console.log(`  cdn      ${tally('cdn')}`);
console.log(`  avg size ${(results.reduce((s, r) => s + r.bytes, 0) / results.length / 1024).toFixed(0)} KB\n`);
process.exitCode = results.some((r) => r.status !== 200) ? 1 : 0;
