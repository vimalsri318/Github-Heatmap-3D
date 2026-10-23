# Observability

How to see what the app is doing in production: logs, traces, metrics, health and alerts.

Everything is built in (`api/_observe.js`) and needs no extra service. A log drain and an uptime monitor are optional add-ons, set up in a few minutes from their dashboards.

## What every API request produces

Every route is wrapped with `observe(route, handler)`:

| Signal | Where it goes | What's in it |
|---|---|---|
| **Request id** | `X-Request-Id` response header, log line, error bodies | Vercel's own id (`x-vercel-id`) when present |
| **Trace** | `traceparent` response header (W3C), log line | Keeps the caller's trace id if one was sent, so the request joins an existing trace |
| **Spans** | `Server-Timing` header (visible in the browser's Network tab), log line | `data` (cache or GitHub), `render` (drawing the SVG), `total` |
| **Log line** | Vercel runtime logs (stdout), as one JSON object | `level`, `msg`, `route`, `status`, `ms`, `spans`, `source`, `user`, `requestId`, `traceId`, `region`, `version`, and `error` + `stack` on failures |
| **Metrics** | `daily_counts` table, flushed about once a minute | Requests by route and status, latency buckets, data source, GitHub/scraper results, protection events |

A crash inside a handler never hangs the request: it becomes a `500` with `{ error, requestId }`, and the full error goes to the logs only.

Other log lines: `upstream fetch` and `upstream fetch failed` (with source, duration and error), `served a stale copy`, `uncached lookups rate limited`, `shared cache read failed`, `metrics flush failed`.

### Finding things in the logs

In Vercel → your project → **Logs**, filter by text:

```
"level":"error"                      every failure
"route":"heatmap","status":500       failed README images
"msg":"upstream fetch failed"        GitHub or the scraper having trouble
"source":"stale"                     requests served an old copy
<a request id>                       everything about one request
```

A user reporting a problem can send the `X-Request-Id` from the response (or the `requestId` in an error message); search for it to find their exact request.

## Metrics in the admin page

`/admin.html` → **API health** shows, for the chosen range:

- Requests, server-error rate, 4xx count, p50 and p95 latency per endpoint
- Where the data came from: instance memory, shared cache, fetched from GitHub, waited on another fetch, old copy
- GitHub API and public scraper results: ok, error, not found
- Protection that kicked in: invalid usernames, rate-limited lookups, stale copies served, analytics batches refused
- Browser errors visitors hit (reported by `src/lib/track.js`, at most 5 per page)

The daily chart can switch to **API requests** and **API errors**.

Requests answered by the CDN or GitHub's image proxy never reach the functions, so they aren't counted here. Vercel → **Observability** shows edge requests and cache hit rates.

## Health check

`GET /api/health` (never cached, makes no GitHub calls, so it's free to poll):

```json
{ "ok": true, "status": "ok", "version": "a1b2c3d", "region": "bom1",
  "checks": { "heatmaps": {"status":"up"}, "database": {"status":"up","ms":12},
              "github_token": {"status":"configured"}, "admin": {"status":"configured"} } }
```

It returns `200` while heatmaps can be served. A database problem shows as `"status": "degraded"`, not down, because heatmaps don't need the database.

## Recommended add-ons

| What | Why | How |
|---|---|---|
| **Log drain** (Axiom, Better Stack or Datadog; the first two have free tiers) | Vercel keeps runtime logs only briefly, especially on the Hobby plan | Vercel → Settings → Log Drains, or the provider's Vercel integration. The JSON lines are parsed into fields automatically |
| **Uptime monitor** (Better Stack, UptimeRobot) | Know within a minute when the site is down | Monitor `https://YOUR-SITE/api/health`, alert when it isn't `200` or the body doesn't contain `"ok":true` |
| **Firewall rate limit** | A hard, global limit on top of the per-instance ones | Vercel → Firewall → add a rate-limit rule on `/api/*` (for example 300 requests per minute per IP) |
| **Spend alert** | Catch runaway usage early | Vercel → Settings → Billing → spend management |

## Alerts worth setting

- `/api/health` not `200` for 2 minutes
- More than 1% server errors on `/api/heatmap` or `/api/contributions` (log drain query on `"level":"error"`)
- Any `upstream fetch failed` with `fromGitHub` for 10 minutes: the token may be revoked or rate limited
- `served_stale` rising: GitHub and the scraper are both failing

## Adding your own

```js
import { observe, count, log } from './_observe.js';

export default observe('my-route', async (req, res, ctx) => {
  const data = await ctx.span('load', () => load());   // timed in Server-Timing and the log
  ctx.fields.items = data.length;                       // extra field on the log line
  count('my_metric', 'some-key');                       // a counter in daily_counts
  log('warn', 'something odd', { detail: 1 });          // a structured log line
  res.end(JSON.stringify(data));
});
```
