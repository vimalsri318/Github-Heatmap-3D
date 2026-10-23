-- Usage analytics: what people do on the site, without cookies or personal data.
-- A visitor is a hash of IP + browser + day + a server secret, so the same person counts
-- once a day and can't be followed from one day to the next (the way Plausible works).

create table if not exists events (
  id        bigserial primary key,
  at        timestamptz not null default now(),
  name      text not null,                 -- 'pageview', 'click', 'load_user', 'copy_code', 'embed_view', …
  page      text,                          -- '/', '/studio.html', '/embed.html'
  visitor   text,                          -- daily anonymous hash (see above)
  session   text,                          -- random per browser tab, from the page
  referrer  text,                          -- host the visit came from, e.g. 'github.com'
  country   text,                          -- ISO code from Vercel's edge
  device    text,                          -- 'mobile' | 'tablet' | 'desktop'
  props     jsonb not null default '{}'    -- event details, e.g. {"label":"Copy code"}
);
create index if not exists events_at_idx on events (at);
create index if not exists events_name_at_idx on events (name, at);

-- Counters for things that happen too often to log one by one (README image renders).
create table if not exists daily_counts (
  day   date not null,
  kind  text not null,                     -- 'readme_render'
  key   text not null,                     -- e.g. 'octocat|3d|grow'
  n     bigint not null default 0,
  primary key (day, kind, key)
);
