// POST /api/mint-website-session
// Header: Authorization: Bearer <NoPauseMD admin-backend Supabase access token>
//
// The admin dashboard's ONE sign-in is now against the NoPauseMD app's own
// backend/Supabase (see admin/js/nopause-backend.js) — staff never sign in
// to the website's Supabase directly. But Orders, Products, Contact
// Messages, Live Chat, Bookings, Speaking Engagements and the website side
// of Super Admin Revenue still read/write the WEBSITE's Supabase project,
// whose row-level-security policies (is_store_admin()) require a real,
// signed-in session on that project.
//
// This endpoint bridges the two: it verifies the caller's NoPauseMD token
// with the admin-backend's own /v1/me (so it can never be spoofed — only a
// real, currently-valid staff session passes), then — using the website
// Supabase project's SERVICE ROLE key, server-side only — finds or creates
// a matching store_admins account for that person's email and mints a real
// website Supabase session for it (via GoTrue's admin generate_link +
// verify, so no password is ever known or needed). The browser then calls
// `sb.auth.setSession(...)` with the result, and every existing
// website-data page keeps working completely unchanged.
//
// No supabase-js dependency — plain fetch against Supabase's REST/Auth
// endpoints, matching the rest of this API layer (see api/_supabase.js).
// Nothing here is reachable without a valid NoPauseMD staff token, and the
// service role key never leaves this function.

const NOPAUSE_BACKEND_URL = process.env.NOPAUSE_BACKEND_URL || 'https://clinipausemd-admin-backend.onrender.com';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.WEBSITE_SUPABASE_SERVICE_ROLE_KEY;

async function findUserByEmail(email) {
  const res = await fetch(SUPABASE_URL + '/auth/v1/admin/users?email=' + encodeURIComponent(email), {
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: 'Bearer ' + SERVICE_ROLE_KEY }
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  const users = (data && data.users) || [];
  return users.find(function (u) { return (u.email || '').toLowerCase() === email.toLowerCase(); }) || null;
}

async function createUser(email) {
  const res = await fetch(SUPABASE_URL + '/auth/v1/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SERVICE_ROLE_KEY, Authorization: 'Bearer ' + SERVICE_ROLE_KEY },
    body: JSON.stringify({ email: email, email_confirm: true })
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    var err = new Error((data && (data.msg || data.message)) || 'Could not create website auth user');
    err.status = res.status;
    throw err;
  }
  return data;
}

async function upsertRow(table, row) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + table, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_ROLE_KEY,
      Authorization: 'Bearer ' + SERVICE_ROLE_KEY,
      Prefer: 'resolution=merge-duplicates'
    },
    body: JSON.stringify(row)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error('Could not upsert into ' + table + ': ' + text);
  }
}

async function deleteRow(table, id) {
  await fetch(SUPABASE_URL + '/rest/v1/' + table + '?id=eq.' + encodeURIComponent(id), {
    method: 'DELETE',
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: 'Bearer ' + SERVICE_ROLE_KEY }
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY) {
    res.status(500).json({ error: 'Not configured: WEBSITE_SUPABASE_SERVICE_ROLE_KEY is missing.' });
    return;
  }

  const authHeader = req.headers.authorization || '';
  const nopauseToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!nopauseToken) {
    res.status(401).json({ error: 'Missing bearer token' });
    return;
  }

  // Verify against the admin-backend itself — this is the only source of truth
  // for "is this a real, currently-valid staff session", never decoded/trusted locally.
  let me;
  try {
    const meRes = await fetch(NOPAUSE_BACKEND_URL + '/v1/me', {
      headers: { Authorization: 'Bearer ' + nopauseToken }
    });
    if (!meRes.ok) {
      res.status(401).json({ error: 'Not a valid NoPauseMD staff session' });
      return;
    }
    me = await meRes.json();
  } catch (err) {
    res.status(502).json({ error: 'Could not reach the NoPauseMD backend' });
    return;
  }

  if (!me.email) {
    res.status(401).json({ error: 'No email on this staff account' });
    return;
  }

  // The website's orders, customers, chats and bookings are business data.
  // Treating clinicians only work their own consultations (in the app
  // backend), so they get no website session at all.
  if (!me.isSuperAdmin && !(Array.isArray(me.permissions) && me.permissions.indexOf('dashboard.read') > -1)) {
    res.status(403).json({ error: 'Your role does not include website data' });
    return;
  }

  try {
    let user = await findUserByEmail(me.email);
    if (!user) user = await createUser(me.email);

    await upsertRow('store_admins', { id: user.id, email: me.email });

    // Keep super_admins in sync with the admin-backend's own super-admin
    // determination (SUPER_ADMIN_EMAILS on the backend) — add, and remove if
    // no longer super admin there, so the two systems never drift apart.
    if (me.isSuperAdmin) {
      await upsertRow('super_admins', { id: user.id });
    } else {
      await deleteRow('super_admins', user.id);
    }

    const linkRes = await fetch(SUPABASE_URL + '/auth/v1/admin/generate_link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SERVICE_ROLE_KEY, Authorization: 'Bearer ' + SERVICE_ROLE_KEY },
      body: JSON.stringify({ type: 'magiclink', email: me.email })
    });
    const linkData = await linkRes.json().catch(() => null);
    if (!linkRes.ok || !linkData || !linkData.hashed_token) {
      throw new Error('Could not generate a sign-in link');
    }

    const verifyRes = await fetch(SUPABASE_URL + '/auth/v1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ type: 'magiclink', token_hash: linkData.hashed_token })
    });
    const session = await verifyRes.json().catch(() => null);
    if (!verifyRes.ok || !session || !session.access_token) {
      throw new Error('Could not verify the sign-in link');
    }

    res.status(200).json({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      isSuperAdmin: !!me.isSuperAdmin
    });
  } catch (err) {
    console.error('mint-website-session: failed', err && err.message);
    res.status(500).json({ error: 'Could not establish a website session' });
  }
};
