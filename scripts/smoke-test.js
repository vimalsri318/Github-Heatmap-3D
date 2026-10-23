// Checks a deployment works end to end. CI runs it after every deploy; run it yourself with:
//   node scripts/smoke-test.js https://github-heatmap-3d.vercel.app
// Exits non-zero if anything is wrong, printing what failed.
const base = (process.argv[2] || process.env.SMOKE_URL || '').replace(/\/$/, '');
if (!/^https?:\/\//.test(base)) {
  console.error('Usage: node scripts/smoke-test.js <deployment url>');
  process.exit(2);
}
const strict = !process.argv.includes('--no-db'); // previews may not have the analytics database
const allowProtected = process.argv.includes('--allow-protected');
// Vercel's Deployment Protection: send the bypass secret when there is one
const headers = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET } : {};

async function get(path, init) {
  // a fresh deployment can take a few seconds to answer everywhere: retry a little
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(base + path, { ...init, headers, signal: AbortSignal.timeout(20_000) });
      return { res, text: await res.text() };
    } catch (err) {
      if (attempt >= 4) throw err;
      await new Promise((r) => setTimeout(r, attempt * 3000));
    }
  }
}

const checks = [
  ['landing page', async () => {
    const { res, text } = await get('/');
    expect(res.status === 200 && text.includes('Heatmap 3D'), `status ${res.status}`);
  }],
  ['studio and admin pages', async () => {
    for (const p of ['/studio.html', '/embed.html', '/admin.html', '/embed.js']) {
      const { res } = await get(p);
      expect(res.status === 200, `${p} → ${res.status}`);
    }
  }],
  ['health', async () => {
    const { res, text } = await get('/api/health');
    const h = JSON.parse(text);
    expect(res.status === 200 && h.ok === true, `status ${res.status}: ${text.slice(0, 200)}`);
    if (strict) expect(h.checks.database.status === 'up', `database: ${JSON.stringify(h.checks.database)}`);
    return `${h.status}, version ${h.version}, db ${h.checks.database.status}, token ${h.checks.github_token.status.split(' ')[0]}`;
  }],
  ['contributions API', async () => {
    const { res, text } = await get('/api/contributions?user=octocat&year=2024');
    const days = JSON.parse(text);
    expect(res.status === 200 && Array.isArray(days) && days.length === 366, `status ${res.status}: ${text.slice(0, 200)}`);
    expect(res.headers.get('x-request-id') && res.headers.get('traceparent'), 'missing trace headers');
    return `source ${res.headers.get('x-data-source')}`;
  }],
  ['README image (animated)', async () => {
    const { res, text } = await get('/api/heatmap?user=octocat&year=2024&animate=grow');
    expect(res.status === 200 && res.headers.get('content-type')?.includes('image/svg+xml'), `status ${res.status}`);
    expect(text.startsWith('<svg') && text.includes('<animateTransform'), 'not an animated SVG');
    return `${Math.round(text.length / 1024)} KB`;
  }],
  ['invalid usernames are refused', async () => {
    const { res } = await get('/api/contributions?user=../../etc');
    expect(res.status === 404, `status ${res.status}`);
  }],
  ['admin data needs sign-in', async () => {
    const { res } = await get('/api/admin-stats');
    expect(res.status === 401, `status ${res.status}`);
  }],
  ['paid endpoints are gone', async () => {
    const { res } = await get('/api/embed-check?item=galaxy');
    expect(res.status === 404, `status ${res.status}`);
  }],
];

function expect(ok, message) {
  if (!ok) throw new Error(message);
}

let failed = 0;
console.log(`Smoke test: ${base}`);
{
  const { res } = await get('/');
  if (res.status === 401 && allowProtected) {
    console.log('  – skipped: this deployment is behind Vercel Deployment Protection (set VERCEL_AUTOMATION_BYPASS_SECRET to test it)');
    process.exit(0);
  }
}
for (const [name, run] of checks) {
  try {
    const note = await run();
    console.log(`  ✓ ${name}${note ? `  (${note})` : ''}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}: ${err.message}`);
  }
}
console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
