// GET /api/me → the signed-in account and what it owns.
// The first call (and then once a day) copies the person's name and email from Clerk
// into our own users table, so our data never depends on the sign-in provider.
import { db } from './_db.js';
import { userIdFrom, clerk } from './_auth.js';
import { observe, log } from './_observe.js';

const send = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
};

export default observe('me', async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'Use GET' });
  const id = await userIdFrom(req);
  if (!id) return send(res, 401, { error: 'Not signed in' });
  try {
    const pool = db();
    const known = await pool.query("select email, name from users where id = $1 and updated_at > now() - interval '1 day'", [id]);
    let user = known.rows[0];
    if (!user) {
      const u = await clerk().users.getUser(id);
      const email = u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress ?? u.emailAddresses[0]?.emailAddress ?? '';
      const name = [u.firstName, u.lastName].filter(Boolean).join(' ') || null;
      const saved = await pool.query(
        `insert into users (id, email, name, avatar_url) values ($1, $2, $3, $4)
         on conflict (id) do update set email = excluded.email, name = excluded.name, avatar_url = excluded.avatar_url, updated_at = now()
         returning email, name`,
        [id, email, name, u.imageUrl ?? null],
      );
      user = saved.rows[0];
    }
    const owned = await pool.query('select item from entitlements where user_id = $1 and (expires_at is null or expires_at > now())', [id]);
    send(res, 200, { id, email: user.email, name: user.name, entitlements: owned.rows.map((r) => r.item) });
  } catch (err) {
    log('error', 'api/me', { error: err.message });
    send(res, 500, { error: 'Could not load your account' });
  }
});
