// Runs as the first step of `npm run build`. On a Vercel production build it applies the
// database migrations, using the project's own DATABASE_URL (which can stay "Sensitive":
// builds can read it, nothing else can). Everywhere else (local, CI, previews) it does nothing.
// If a migration fails, the build fails and the new version never goes live.
import { spawnSync } from 'node:child_process';

if (process.env.VERCEL_ENV !== 'production') {
  console.log(`migrations: skipped (VERCEL_ENV=${process.env.VERCEL_ENV || 'unset'})`);
  process.exit(0);
}
if (!process.env.DATABASE_URL && !process.env.DATABASE_URL_UNPOOLED) {
  console.error('migrations: DATABASE_URL is not set for Production in Vercel');
  process.exit(1);
}
const run = spawnSync(process.execPath, ['scripts/migrate.js'], { stdio: 'inherit' });
process.exit(run.status ?? 1);
