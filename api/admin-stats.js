// GET /api/admin-stats?days=30 → everything the admin page shows. Signed-in admins only:
// the Clerk account's email must be listed in ADMIN_EMAILS (comma-separated).
import { db } from './_db.js';
import { userIdFrom, clerk } from './_auth.js';

const admins = () => (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
const emailCache = new Map();

async function emailOf(id) {
  if (!emailCache.has(id)) {
    const u = await clerk().users.getUser(id);
    const primary = u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId) ?? u.emailAddresses[0];
    // only a verified address counts, so nobody can claim an admin's email
    emailCache.set(id, primary?.verification?.status === 'verified' ? primary.emailAddress.toLowerCase() : '');
  }
  return emailCache.get(id);
}

const send = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
};

// Our own visits, not embeds on other sites (those are counted separately).
const SITE = `name = 'pageview' and coalesce(props->>'embed', 'false') <> 'true'`;

const QUERIES = {
  daily: `select to_char(d, 'YYYY-MM-DD') as day,
            coalesce(e.visitors, 0)::int as visitors, coalesce(e.views, 0)::int as views,
            coalesce(e.embeds, 0)::int as embeds, coalesce(r.renders, 0)::int as renders
          from generate_series(current_date - ($1::int - 1), current_date, interval '1 day') d
          left join (select at::date as day, count(distinct visitor) filter (where ${SITE}) as visitors,
                       count(*) filter (where ${SITE}) as views,
                       count(*) filter (where name = 'embed_view' and referrer is not null) as embeds
                     from events where at >= current_date - ($1::int - 1) group by 1) e on e.day = d::date
          left join (select day, sum(n) as renders from daily_counts where kind = 'image_render' and day >= current_date - ($1::int - 1) group by 1) r on r.day = d::date
          order by d`,
  totals: `select count(distinct (visitor, at::date)) filter (where ${SITE})::int as visitors,
             count(distinct session) filter (where ${SITE})::int as visits,
             count(*) filter (where ${SITE})::int as views,
             count(*) filter (where name = 'embed_view' and referrer is not null)::int as embed_views,
             count(distinct referrer) filter (where name = 'embed_view')::int as embed_sites,
             count(*) filter (where name = 'load_user')::int as loads,
             count(distinct props->>'user') filter (where name = 'load_user')::int as github_users,
             count(*) filter (where name = 'copy_code')::int as copies
           from events where at >= current_date - ($1::int - 1)`,
  renders: `select coalesce(sum(n), 0)::int as total,
              coalesce(sum(n) filter (where split_part(key, '|', 4) = 'github'), 0)::int as github
            from daily_counts where kind = 'image_render' and day >= current_date - ($1::int - 1)`,
  funnel: `with s as (
             select session,
               bool_or(${SITE} and page = '/') as landed,
               bool_or(${SITE} and page = '/studio.html') as studio,
               bool_or(name = 'load_user') as loaded,
               bool_or(name = 'click' and props->>'id' = 'openDrawer') as shared,
               bool_or(name = 'copy_code') as copied
             from events where at >= current_date - ($1::int - 1) and session is not null
               and coalesce(props->>'embed', 'false') <> 'true'
             group by session)
           select count(*) filter (where landed or studio)::int as visits,
             count(*) filter (where studio)::int as studio,
             count(*) filter (where studio and loaded)::int as loaded,
             count(*) filter (where studio and loaded and shared)::int as shared,
             count(*) filter (where studio and loaded and copied)::int as copied
           from s`,
  pages: `select page as key, count(*)::int as n, count(distinct visitor)::int as people
          from events where ${SITE} and at >= current_date - ($1::int - 1) group by 1 order by 2 desc limit 10`,
  clicks: `select props->>'label' as key, page, count(*)::int as n, count(distinct visitor)::int as people
           from events where name = 'click' and at >= current_date - ($1::int - 1) and props->>'label' <> ''
           group by 1, 2 order by 3 desc limit 15`,
  outbound: `select props->>'out' as key, count(*)::int as n from events
             where name = 'click' and props ? 'out' and at >= current_date - ($1::int - 1) group by 1 order by 2 desc limit 8`,
  // each visit counts once, by the site its first page came from
  referrers: `select coalesce(referrer, 'Direct / unknown') as key, count(*)::int as n
              from (select distinct on (session) session, referrer from events
                    where ${SITE} and at >= current_date - ($1::int - 1) and session is not null order by session, id) first
              group by 1 order by 2 desc limit 10`,
  campaigns: `select props->>'source' as key, count(distinct visitor)::int as n from events
              where ${SITE} and props ? 'source' and at >= current_date - ($1::int - 1) group by 1 order by 2 desc limit 8`,
  embedSites: `select referrer as key, count(*)::int as n, count(distinct props->>'user')::int as people
               from events where name = 'embed_view' and referrer is not null and at >= current_date - ($1::int - 1)
               group by 1 order by 2 desc limit 10`,
  githubUsers: `select props->>'user' as key, count(*)::int as n from events
                where name in ('load_user', 'embed_view') and props->>'user' <> '' and at >= current_date - ($1::int - 1)
                group by 1 order by 2 desc limit 10`,
  readmeUsers: `select split_part(key, '|', 1) as key, sum(n)::int as n from daily_counts
                where kind = 'image_render' and day >= current_date - ($1::int - 1) group by 1 order by 2 desc limit 10`,
  copies: `select coalesce(props->>'dest', '?') as key, count(*)::int as n from events
           where name = 'copy_code' and at >= current_date - ($1::int - 1) group by 1 order by 2 desc`,
  worlds: `select coalesce(props->>'style', 'city') as key, count(*)::int as n from events
           where name in ('load_user', 'embed_view', 'copy_code') and at >= current_date - ($1::int - 1) group by 1 order by 2 desc`,
  paywall: `select coalesce(props->>'item', '?') as key, count(*)::int as n from events
            where name = 'paywall_open' and at >= current_date - ($1::int - 1) group by 1 order by 2 desc`,
  countries: `select coalesce(country, '??') as key, count(distinct visitor)::int as n from events
              where ${SITE} and at >= current_date - ($1::int - 1) group by 1 order by 2 desc limit 10`,
  devices: `select coalesce(device, '?') as key, count(distinct visitor)::int as n from events
            where ${SITE} and at >= current_date - ($1::int - 1) group by 1 order by 2 desc`,
  signups: `select count(*)::int as total, count(*) filter (where created_at >= current_date - ($1::int - 1))::int as recent from users`,
  newUsers: `select email, name, to_char(created_at, 'YYYY-MM-DD HH24:MI') as at from users order by created_at desc limit 10`,
  revenue: `select currency, count(*)::int as n, coalesce(sum(amount_minor), 0)::bigint as minor from purchases
            where status in ('paid', 'active') and created_at >= current_date - ($1::int - 1) group by 1`,
  live: `select to_char(at, 'YYYY-MM-DD HH24:MI:SS') as at, name, page, referrer, country, device, props
         from events order by at desc limit 40`,
};
const SINGLE = new Set(['totals', 'renders', 'funnel', 'signups']);

/** Every number on the admin page for the last `days` days. */
export async function collectStats(days) {
  const pool = db();
  const entries = await Promise.all(
    Object.entries(QUERIES).map(async ([key, sql]) => {
      const { rows } = await pool.query(sql, sql.includes('$1') ? [days] : []);
      return [key, SINGLE.has(key) ? rows[0] : rows];
    }),
  );
  return { days, generatedAt: new Date().toISOString(), ...Object.fromEntries(entries) };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'Use GET' });
  const id = await userIdFrom(req);
  if (!id) return send(res, 401, { error: 'Sign in to see the admin page' });
  try {
    if (!admins().includes(await emailOf(id))) return send(res, 403, { error: 'This account is not an admin. Add its email to ADMIN_EMAILS.' });
  } catch (err) {
    console.error('api/admin-stats auth', err);
    return send(res, 500, { error: 'Could not check your account' });
  }

  const days = Math.min(365, Math.max(1, Number(new URL(req.url, 'http://x').searchParams.get('days')) || 30));
  try {
    send(res, 200, await collectStats(days));
  } catch (err) {
    console.error('api/admin-stats', err);
    const missing = /relation "(events|daily_counts)" does not exist/.test(err.message);
    send(res, 500, { error: missing ? 'Analytics tables are missing. Run: npm run db:migrate' : 'Could not load the numbers' });
  }
}
