// Anonymous usage analytics for our own pages. No cookies, nothing personal: a random id per
// browser tab, and the server turns the IP into a daily hash it never stores.
//   startTracking()            → page view + every click on a link or button
//   track('copy_code', {…})    → a named action
// Events are batched and sent with sendBeacon, so they never slow the page down.

const queue = [];
let session = '';
let timer = null;
const page = () => location.pathname.replace(/\/index\.html$/, '/') || '/';

function newSession() {
  try {
    let id = sessionStorage.getItem('hm3d-session');
    if (!id) sessionStorage.setItem('hm3d-session', (id = Math.random().toString(36).slice(2, 12)));
    return id;
  } catch {
    return Math.random().toString(36).slice(2, 12);
  }
}

function flush() {
  clearTimeout(timer);
  timer = null;
  if (!queue.length) return;
  const body = JSON.stringify({ session, events: queue.splice(0, 30) });
  const sent = navigator.sendBeacon?.('/api/track', new Blob([body], { type: 'application/json' }));
  if (!sent) fetch('/api/track', { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' } }).catch(() => {});
  if (queue.length) flush();
}

/** Records a named action, e.g. track('load_user', { user: 'octocat' }). */
export function track(name, props = {}) {
  if (!session || import.meta.env?.MODE === 'test') return;
  queue.push({ name, page: page(), props, ref: name === 'pageview' || name === 'embed_view' ? document.referrer : undefined });
  if (queue.length >= 20) flush();
  else timer ||= setTimeout(flush, 4000);
}

/** What a clicked link or button is called, in words a person would recognise. */
function labelOf(el) {
  // the first visible line: "GitHub README", not "GitHub READMEYour profile page"
  const visible = (el.innerText || el.textContent || '').split('\n').map((s) => s.trim()).find(Boolean);
  const text = el.dataset.track || el.getAttribute('aria-label') || visible || el.title || el.id || el.tagName;
  return text.replace(/[→←↗↘✕×›»]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
}

/** Starts tracking this page: a page view now, clicks from here on. */
export function startTracking(extra = {}) {
  if (session) return;
  if (navigator.webdriver) return; // automated browsers aren't visitors
  session = newSession();
  const q = new URLSearchParams(location.search);
  const utm = Object.fromEntries(['utm_source', 'utm_medium', 'utm_campaign'].filter((k) => q.get(k)).map((k) => [k.slice(4), q.get(k)]));
  track('pageview', { width: innerWidth, ...utm, ...extra });

  document.addEventListener(
    'click',
    (e) => {
      const el = e.target.closest?.('a, button, [role="button"], [role="radio"], [role="tab"], [data-track]');
      if (!el) return;
      const props = { label: labelOf(el) };
      if (el.id) props.id = el.id;
      if (el.href) {
        const url = new URL(el.href, location.href);
        if (url.host !== location.host) props.out = url.host; // a link to another site
      }
      track('click', props);
    },
    { capture: true, passive: true },
  );
  addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
}
