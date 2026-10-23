// Fetches a user's contribution calendar in the browser, through our own /api/contributions.
// That endpoint caches it for everyone (see api/_contributions.js), so a popular embed costs
// one upstream lookup an hour instead of one per visitor.
export async function fetchContributions(username, year) {
  const res = await fetch(`/api/contributions?${new URLSearchParams({ user: username, year })}`);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(json.error || (res.status === 404 ? `User "${username}" not found` : `Request failed (${res.status})`));
  }
  // [{ date: 'YYYY-MM-DD', count: number, level: 0-4 }]
  return json;
}

// Deterministic sample data so the scene isn't empty before a username is entered.
export function sampleContributions(year) {
  let seed = year * 9301;
  const rand = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const days = [];
  const d = new Date(Date.UTC(year, 0, 1));
  while (d.getUTCFullYear() === year) {
    const month = d.getUTCMonth();
    const activity = 0.25 + 0.6 * Math.sin((month / 11) * Math.PI); // busier mid-year
    const count = rand() < activity ? Math.floor(rand() ** 2 * 60) : 0;
    days.push({ date: d.toISOString().slice(0, 10), count, level: 0 });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return withLevels(days);
}

// A full, believable year for showcases: every month filled, busier on weekdays,
// quieter at weekends, a couple of busy seasons, streaks, rest days and a few big pushes.
// Deterministic, so the landing page looks the same for everyone.
export function demoContributions(year) {
  let seed = 20260101;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const days = [];
  const d = new Date(Date.UTC(year, 0, 1));
  let streakLeft = 0;
  while (d.getUTCFullYear() === year) {
    const t = (d - Date.UTC(year, 0, 1)) / (365 * 864e5); // 0..1 through the year
    const weekend = d.getUTCDay() === 0 || d.getUTCDay() === 6;
    const season = 0.55 + 0.3 * Math.sin(t * Math.PI * 4 - 0.6) + 0.15 * Math.sin(t * Math.PI * 9); // two busy seasons
    if (streakLeft <= 0 && rand() < 0.04) streakLeft = 5 + Math.floor(rand() * 12); // a focused sprint
    const sprint = streakLeft-- > 0 ? 1.6 : 1;
    const rest = rand() < (weekend ? 0.38 : 0.08) && sprint === 1;
    let count = rest ? 0 : Math.round((2 + 13 * season * (weekend ? 0.45 : 1) * sprint) * (0.45 + rand() * 0.9));
    if (!rest && rand() < 0.025) count += 20 + Math.floor(rand() * 25); // launch days
    days.push({ date: d.toISOString().slice(0, 10), count: Math.max(0, count), level: 0 });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  // levels by quartile of the active days, the way GitHub assigns them
  const active = days.map((x) => x.count).filter(Boolean).sort((p, q) => p - q);
  const q = [0.25, 0.5, 0.75].map((f) => active[Math.floor(f * (active.length - 1))]);
  return days.map((x) => ({ ...x, level: x.count === 0 ? 0 : 1 + q.filter((v) => x.count > v).length }));
}

// Levels relative to the busiest day, for data that doesn't already include them.
function withLevels(days) {
  const max = Math.max(1, ...days.map((d) => d.count));
  return days.map((d) => ({ ...d, level: d.count === 0 ? 0 : Math.min(4, Math.ceil((d.count / max) * 4)) }));
}

export function computeStats(days) {
  let total = 0;
  let best = days[0];
  let streak = 0;
  let longest = 0;
  for (const d of days) {
    total += d.count;
    if (d.count > best.count) best = d;
    streak = d.count > 0 ? streak + 1 : 0;
    longest = Math.max(longest, streak);
  }
  return { total, best, longest };
}
