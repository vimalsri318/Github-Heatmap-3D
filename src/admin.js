// Admin dashboard: who uses Heatmap 3D, where they come from and what they do.
// Data comes from /api/admin-stats, which only answers admin accounts (ADMIN_EMAILS).
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './admin.css';
import { signInAvailable, signInWithGoogle, onAccountChange, currentAccount, startAccounts, mountAccountButton, authFetch } from './lib/account.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const fmt = (n) => Number(n || 0).toLocaleString('en-US');
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '–');

let days = 30;
let metric = 'visitors';
let data = null;

// ---------- sign-in gate ----------
function gate(text, showButton = true) {
  $('gate').hidden = false;
  $('dash').hidden = true;
  $('gateText').innerHTML = text;
  $('signIn').hidden = !showButton;
}

$('signIn').addEventListener('click', () => signInWithGoogle().catch(() => gate('Sign-in is not set up here (no Clerk key).', false)));

if (!signInAvailable()) gate('Sign-in is not set up: add <code>VITE_CLERK_PUBLISHABLE_KEY</code> to <code>.env.local</code>.', false);
startAccounts();
let mounted = false;
onAccountChange((who) => {
  if (!who) return gate('Sign in with an admin account to see who is using Heatmap 3D.');
  if (!mounted) mountAccountButton($('account')).then(() => (mounted = true));
  load();
});

// ---------- loading ----------
async function load() {
  if (!currentAccount()) return;
  $('foot').textContent = 'Loading…';
  try {
    const res = await authFetch(`/api/admin-stats?days=${days}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return gate(esc(body.error || `Could not load (${res.status})`), res.status === 401);
    data = body;
    $('gate').hidden = true;
    $('dash').hidden = false;
    render();
  } catch (err) {
    $('foot').innerHTML = `<span class="error">Could not load: ${esc(err.message)}</span>`;
  }
}

$('range').addEventListener('click', (e) => {
  const b = e.target.closest('[data-days]');
  if (!b) return;
  days = Number(b.dataset.days);
  for (const x of $('range').children) x.setAttribute('aria-checked', x === b);
  load();
});
$('metric').addEventListener('click', (e) => {
  const b = e.target.closest('[data-metric]');
  if (!b) return;
  metric = b.dataset.metric;
  for (const x of $('metric').children) x.setAttribute('aria-checked', x === b);
  renderChart();
});
setInterval(() => document.visibilityState === 'visible' && load(), 60_000); // keep it fresh
let resizing;
addEventListener('resize', () => {
  clearTimeout(resizing);
  resizing = setTimeout(() => data && renderChart(), 150);
});

// Dev only: show numbers without signing in, e.g. window.__adminShow(await (await fetch(…)).json())
if (import.meta.env.DEV)
  window.__adminShow = (d) => {
    data = d;
    $('gate').hidden = true;
    $('dash').hidden = false;
    render();
  };

// ---------- rendering ----------
function render() {
  renderTiles();
  renderChart();
  renderFunnel();
  renderLists();
  renderHealth();
  renderLive();
  $('foot').textContent = `Updated ${new Date(data.generatedAt).toLocaleTimeString()} · refreshes every minute · visitors are counted once a day, without cookies`;
}

function renderTiles() {
  const t = data.totals;
  const api = data.api.reduce((a, r) => ({ requests: a.requests + r.requests, errors: a.errors + r.errors }), { requests: 0, errors: 0 });
  const tiles = [
    [fmt(t.visitors), 'Visitors', `${fmt(t.visits)} visits`],
    [fmt(t.views), 'Page views', `${t.visits ? (t.views / t.visits).toFixed(1) : 0} per visit`],
    [fmt(t.github_users), 'GitHub users made', `${fmt(t.loads)} loads in the Studio`],
    [fmt(t.copies), 'Codes copied', 'embeds, READMEs and links'],
    [fmt(t.embed_views), 'Embed views', `on ${fmt(t.embed_sites)} other sites`],
    [fmt(data.renders.total), 'README image renders', `${fmt(data.renders.github)} via GitHub`],
    [fmt(data.signups.recent), 'New accounts', `${fmt(data.signups.total)} in total`],
    [fmt(api.requests), 'API requests', `${api.requests ? ((api.errors / api.requests) * 100).toFixed(2) : '0.00'}% server errors`],
  ];
  $('tiles').innerHTML = tiles.map(([n, label, sub]) => `<div class="tile"><span>${label}</span><b>${n}</b><small>${sub}</small></div>`).join('');
}

const METRICS = {
  visitors: 'Visitors per day',
  views: 'Page views per day',
  embeds: 'Embed views on other sites, per day',
  renders: 'README image renders per day',
  api: 'API requests per day (that reached our functions)',
  api_errors: 'API server errors per day',
};

/** A "nice" axis top: 1, 2 or 5 times a power of ten, at or above `max`. */
function niceMax(max) {
  if (max <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(max));
  return [1, 2, 5, 10].map((m) => m * p).find((v) => v >= max);
}

function renderChart() {
  $('chartTitle').textContent = METRICS[metric];
  const rows = data.daily;
  const W = Math.max(280, $('chart').clientWidth || 1000); // drawn at its real size, so text never stretches
  const H = 220;
  const pad = { l: 40, r: 8, t: 10, b: 24 };
  const top = niceMax(Math.max(...rows.map((r) => r[metric])));
  const step = (W - pad.l - pad.r) / rows.length;
  const bw = Math.max(2, Math.min(28, step - 2)); // 2px gap between bars
  const y = (v) => pad.t + (H - pad.t - pad.b) * (1 - v / top);
  let svg = '';
  for (const v of [0, top / 2, top]) {
    svg += `<line class="grid-line" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end">${fmt(v)}</text>`;
  }
  const every = Math.ceil(rows.length / Math.max(3, Math.floor(W / 110)));
  let hits = ''; // hover areas, drawn on top of the bars
  rows.forEach((r, i) => {
    const x = pad.l + i * step + (step - bw) / 2;
    const h = Math.max(0, y(0) - y(r[metric]));
    // 4px rounded top, flat on the baseline
    const rr = Math.min(4, bw / 2, h);
    const d = h > 0 ? `M${x} ${y(0)}V${y(0) - h + rr}Q${x} ${y(0) - h} ${x + rr} ${y(0) - h}H${x + bw - rr}Q${x + bw} ${y(0) - h} ${x + bw} ${y(0) - h + rr}V${y(0)}Z` : '';
    svg += `<path class="bar" d="${d}"/>`;
    hits += `<rect class="hit" x="${pad.l + i * step}" y="${pad.t}" width="${step}" height="${H - pad.t - pad.b}" data-i="${i}"/>`;
    if (i % every === 0 || (i === rows.length - 1 && i % every >= every / 2)) svg += `<text class="axis" x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${r.day.slice(5)}</text>`;
  });
  $('chart').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${METRICS[metric]}">${svg}${hits}</svg><div class="tip" hidden></div>`;
  const tip = $('chart').querySelector('.tip');
  const svgEl = $('chart').querySelector('svg');
  svgEl.addEventListener('mousemove', (e) => {
    const hit = e.target.closest('.hit');
    svgEl.querySelector('.bar.on')?.classList.remove('on');
    if (!hit) return (tip.hidden = true);
    const r = rows[hit.dataset.i];
    svgEl.querySelectorAll('.bar')[hit.dataset.i].classList.add('on');
    const box = hit.getBoundingClientRect();
    const host = $('chart').getBoundingClientRect();
    tip.hidden = false;
    tip.style.left = `${box.left - host.left + box.width / 2}px`;
    tip.style.top = `${y(r[metric]) * (host.height / H)}px`;
    tip.innerHTML = `${r.day} · <b>${fmt(r[metric])}</b> ${{ renders: 'renders', api: 'requests', api_errors: 'errors' }[metric] || metric}`;
  });
  svgEl.addEventListener('mouseleave', () => {
    tip.hidden = true;
    svgEl.querySelector('.bar.on')?.classList.remove('on');
  });
  $('chartTable').innerHTML = `<div class="scroll"><table><tr><th>Day</th><th>Visitors</th><th>Page views</th><th>Embed views</th><th>README renders</th><th>API requests</th><th>API errors</th></tr>${rows
    .map((r) => `<tr><td>${r.day}</td><td class="num">${fmt(r.visitors)}</td><td class="num">${fmt(r.views)}</td><td class="num">${fmt(r.embeds)}</td><td class="num">${fmt(r.renders)}</td><td class="num">${fmt(r.api)}</td><td class="num">${fmt(r.api_errors)}</td></tr>`)
    .join('')}</table></div>`;
}

function renderFunnel() {
  const f = data.funnel;
  const steps = [
    ['Visited the site', f.visits],
    ['Opened the Studio', f.studio],
    ['Loaded a username', f.loaded],
    ['Opened Share & embed', f.shared],
    ['Copied the code', f.copied],
  ];
  const max = Math.max(1, f.visits);
  $('funnel').innerHTML = steps
    .map(([label, n], i) => `<div class="step"><span>${label}</span><div class="track"><div class="fill" style="width:${(n / max) * 100}%"></div></div><span class="num">${fmt(n)}<small>${i ? pct(n, steps[i - 1][1]) : ''}</small></span></div>`)
    .join('');
}

const COUNTRY = (() => {
  try {
    const names = new Intl.DisplayNames(['en'], { type: 'region' });
    return (c) => (c && c !== '??' ? names.of(c) || c : 'Unknown');
  } catch {
    return (c) => c;
  }
})();

function list(title, hint, rows, { label = (r) => r.key, sub = () => '' } = {}) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  const items = rows.length
    ? `<ul class="list">${rows.map((r) => `<li><i style="width:${(r.n / max) * 100}%"></i><span>${esc(label(r))}${sub(r) ? `<span class="sub">${esc(sub(r))}</span>` : ''}</span><b>${fmt(r.n)}</b></li>`).join('')}</ul>`
    : `<p class="empty">Nothing yet in this range.</p>`;
  return `<section class="panel"><h2>${title}</h2><p class="hint">${hint}</p>${items}</section>`;
}

function renderLists() {
  const d = data;
  $('lists').innerHTML = [
    list('Where visits come from', 'Visits by the site that linked them', d.referrers),
    list('Sites embedding it', 'Embed views by the website showing them', d.embedSites, { sub: (r) => `${r.people} heatmaps` }),
    list('Most clicked', 'Buttons and links, by page', d.clicks, { sub: (r) => r.page }),
    list('Pages', 'Page views', d.pages, { sub: (r) => `${fmt(r.people)} visitors` }),
    list('GitHub users shown', 'Loaded in the Studio or shown in an embed', d.githubUsers, { label: (r) => `@${r.key}` }),
    list('README images', 'Renders per GitHub user (views are higher: GitHub caches them)', d.readmeUsers, { label: (r) => `@${r.key}` }),
    list('Code copied for', 'Where people put it', d.copies, { label: (r) => ({ website: 'Website (iframe)', script: 'Website (script)', readme: 'GitHub README', link: 'Link' })[r.key] || r.key }),
    list('Worlds', 'Styles loaded, embedded or copied', d.worlds),
    list('Links out', 'Clicks to other websites', d.outbound),
    list('Campaigns', 'Visitors by utm_source', d.campaigns),
    list('Countries', 'Visitors', d.countries, { label: (r) => COUNTRY(r.key) }),
    list('Devices', 'Visitors', d.devices),
    list('Newest accounts', 'Signed up with Google', d.newUsers.map((u) => ({ key: u.name || u.email, n: 0, at: u.at, email: u.email })), { sub: (r) => `${r.email} · ${r.at}` }).replace(/<b>0<\/b>/g, ''),
  ].join('');
}

function describe(e) {
  const p = e.props || {};
  if (e.name === 'click') return `“${p.label}”${p.out ? ` → ${p.out}` : ''}`;
  if (e.name === 'pageview') return [e.referrer && `from ${e.referrer}`, p.source && `utm ${p.source}`, p.embed && 'embed'].filter(Boolean).join(' · ');
  return Object.entries(p).map(([k, v]) => `${k}: ${v}`).join(' · ');
}

// Latency percentiles from the bucket counts: "p95 ≤ 250 ms" means 95% finished within 250 ms.
const BUCKETS = ['50', '100', '250', '500', '1000', '2500', '5000', 'slow'];
function percentile(route, p) {
  const rows = data.latency.filter((r) => r.route === route);
  const total = rows.reduce((s, r) => s + r.n, 0);
  if (!total) return '–';
  let seen = 0;
  for (const b of BUCKETS) {
    seen += rows.find((r) => r.bucket === b)?.n || 0;
    if (seen / total >= p) return b === 'slow' ? '> 5 s' : `≤ ${Number(b) >= 1000 ? `${Number(b) / 1000} s` : `${b} ms`}`;
  }
  return '–';
}

const SOURCE_NAMES = { memory: 'Instance memory', shared: 'Shared cache', upstream: 'Fetched from GitHub', joined: 'Waited on a fetch', stale: 'Old copy (source down)', sample: 'Sample data', not_found: 'Unknown user', failed: 'Failed' };
const PROTECTION_NAMES = { invalid_username: 'Invalid usernames refused', lookup_rate_limited: 'New lookups rate limited', served_stale: 'Old copy served (GitHub failed)', track_rate_limited: 'Analytics batches refused' };

function renderHealth() {
  const routes = data.api;
  const rows = routes
    .map((r) => {
      const rate = r.requests ? (r.errors / r.requests) * 100 : 0;
      return `<tr><td>/api/${esc(r.route.replace('_', '-'))}</td><td class="num">${fmt(r.requests)}</td><td class="num${rate >= 1 ? ' bad' : ''}">${rate.toFixed(2)}%</td><td class="num">${fmt(r.client_errors)}</td><td class="num">${percentile(r.route, 0.5)}</td><td class="num">${percentile(r.route, 0.95)}</td></tr>`;
    })
    .join('');
  $('health').innerHTML = routes.length
    ? `<div class="scroll"><table><tr><th>Endpoint</th><th>Requests</th><th>Server errors</th><th>4xx</th><th>p50</th><th>p95</th></tr>${rows}</table></div>`
    : '<p class="empty">No API traffic recorded in this range yet.</p>';
  $('healthLists').innerHTML = [
    list('Where the data came from', 'Answered by each layer (CDN hits never reach us, so they aren’t here)', data.dataSources, { label: (r) => SOURCE_NAMES[r.key] || r.key }),
    list('GitHub and backup', 'Upstream fetches by source and result', data.upstream, { label: (r) => { const [src, out] = r.key.split('|'); return `${src === 'fromGitHub' ? 'GitHub API' : 'Public scraper'} · ${out.replace('_', ' ')}`; } }),
    list('Protection', 'Abuse and failure handling that kicked in', data.protection, { label: (r) => PROTECTION_NAMES[r.key] || r.key }),
    list('Browser errors', 'JavaScript errors visitors hit', data.clientErrors, { sub: (r) => `${r.page || ''} ${r.where_at || ''}` }),
  ].join('');
}

function renderLive() {
  $('live').innerHTML =
    `<tr><th>Time</th><th>Event</th><th>Page</th><th>Where</th><th>Details</th></tr>` +
    data.live
      .map((e) => `<tr><td>${esc(e.at.slice(5))}</td><td><span class="pill">${esc(e.name)}</span></td><td>${esc(e.page)}</td><td>${esc(COUNTRY(e.country))} · ${esc(e.device)}</td><td>${esc(describe(e))}</td></tr>`)
      .join('');
}
