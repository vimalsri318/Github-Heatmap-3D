// GET /api/health → is the app up, and is each part it relies on working?
// For uptime monitors: 200 while heatmaps can be served (the database is only needed for
// analytics, so a database problem shows as "degraded", not down). No GitHub calls: free to poll.
import { db } from './_db.js';
import { observe } from './_observe.js';

const started = new Date().toISOString();

async function checkDb() {
  if (!process.env.DATABASE_URL) return { status: 'not_configured' };
  const t = Date.now();
  try {
    const { rows } = await Promise.race([
      db().query(
        "select (select count(*)::int from schema_migrations) as migrations, (select count(*)::int from information_schema.tables where table_name in ('events','daily_counts')) as analytics_tables",
      ),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timed out after 3s')), 3000)),
    ]);
    const r = rows[0];
    return { status: r.analytics_tables === 2 ? 'up' : 'needs_migration', ms: Date.now() - t, ...r };
  } catch (err) {
    return { status: 'down', ms: Date.now() - t, error: err.message };
  }
}

export default observe('health', async (req, res) => {
  const database = await checkDb();
  const checks = {
    heatmaps: { status: 'up' },
    database,
    github_token: { status: process.env.GITHUB_TOKEN ? 'configured' : 'missing (using the public scraper only)' },
    admin: { status: process.env.ADMIN_EMAILS && process.env.CLERK_SECRET_KEY ? 'configured' : 'not_configured' },
  };
  const degraded = database.status !== 'up' || !process.env.GITHUB_TOKEN;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.statusCode = 200;
  res.end(
    JSON.stringify({
      ok: true,
      status: degraded ? 'degraded' : 'ok',
      version: (process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 7),
      region: process.env.VERCEL_REGION || 'local',
      instance_started: started,
      checks,
    }),
  );
});
