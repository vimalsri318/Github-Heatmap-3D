// Who is calling: checks the Clerk session token sent as "Authorization: Bearer …".
// Returns the Clerk user id, or null for anyone not signed in (or with a bad token).
import { createClerkClient, verifyToken } from '@clerk/backend';

// Pages allowed to use a session token here (Clerk checks the token's "azp").
const ORIGINS = ['https://heatmap3d.thoughtlatch.com', 'https://github-heatmap-3d.vercel.app', 'http://localhost:5173', 'http://localhost:5174', ...(process.env.SITE_ORIGINS || '').split(',').filter(Boolean)];

export async function userIdFrom(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  try {
    const claims = await verifyToken(header.slice(7), { secretKey: process.env.CLERK_SECRET_KEY, authorizedParties: ORIGINS });
    return claims.sub;
  } catch {
    return null;
  }
}

let client = null;
export const clerk = () => (client ||= createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY }));
