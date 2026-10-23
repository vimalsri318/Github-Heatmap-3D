# Deployment

Everything ships through GitHub Actions ([.github/workflows/ci-cd.yml](../.github/workflows/ci-cd.yml)).

| You do | What runs |
|---|---|
| Push to any branch | **Test and build**: migrations on an empty Postgres (twice, to prove they're safe to re-run), all tests including the database ones, and the production build |
| Open a pull request | The above, then a **preview deployment**, a smoke test, and a comment with the preview link |
| Merge or push to `main` | The above, then **migrate the production database**, **deploy to production**, and **smoke-test the live site** |

Production deploys run one at a time and are never cancelled halfway. If any step fails, the live site stays on the previous deployment, and the failed run shows Vercel's logs.

## Setup (once)

1. Create a token at [vercel.com/account/tokens](https://vercel.com/account/tokens), scoped to the team that owns the project.
2. Add it to the repository:
   ```bash
   gh secret set VERCEL_TOKEN
   ```
3. In Vercel → Settings → Environment Variables (Production), make sure these exist: `DATABASE_URL`, `GITHUB_TOKEN`, `ADMIN_EMAILS`, `ANALYTICS_SALT`, `CLERK_SECRET_KEY`, `VITE_CLERK_PUBLISHABLE_KEY`.

The workflow reads the database address from Vercel at deploy time (`vercel pull`), so it is never stored in GitHub. If `DATABASE_URL` is marked **Sensitive** in Vercel it can't be read back; in that case also add it to GitHub with `gh secret set DATABASE_URL_UNPOOLED` (the direct, non-pooled address).

Optional: to smoke-test protected preview deployments, turn on Vercel → Settings → Deployment Protection → **Protection Bypass for Automation** and add that value as the `VERCEL_AUTOMATION_BYPASS_SECRET` secret.

## Migrations

Files in `db/migrations/` run in name order, once each, recorded in `schema_migrations` (`scripts/migrate.js`). They run **before** the new code goes live, so every migration must keep the previous code working: add tables and columns, don't rename or drop them in the same release.

## Checking a deployment by hand

```bash
node scripts/smoke-test.js https://github-heatmap-3d.vercel.app
```

## Rolling back

Vercel → Deployments → pick the last good one → **Promote to Production**. It takes seconds. Migrations only add things, so the older code runs fine on the newer schema.
