// MIRROR of api/admin-video-token.js at the repo root.
// The admin dashboard and the public website are two separate Vercel
// projects built from this one repo, each with its own Root Directory
// (repo root vs admin/), so a function living only under the root api/
// folder is never deployed to clinipausemd-admin.vercel.app — it 404s
// there. This copy is what the admin dashboard actually calls. Keep the
// two files in sync; they're identical on purpose.

// POST /api/admin-video-token
// Header: Authorization: Bearer <website Supabase access token>
// Body: { booking_id }
//
// Doctor/staff-side counterpart to twilio-video-token.js. Verifies the
// caller is a signed-in store_admin (same is_store_admin() check used by
// every other admin-only endpoint) before issuing a Twilio Video token for
// the same room a patient would join — the admin dashboard is the only
// place website staff ever sees this, never the mobile app's own calling,
// which is a separate system entirely.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const { isConfigured, buildVideoAccessToken, findOrCreateRoom } = require('./_twilio');

// Also pulls the admin's own store_admins row (RLS lets anyone read their
// own row) so we can record their first name against the booking they
// attend — staff-attribution tracking the super admin asked for, so she can
// see which team member handled which consultation.
async function getAdminIdentity(accessToken) {
  if (!accessToken) return null;

  const [adminCheck, userRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/rpc/is_store_admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({})
    }),
    fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` }
    })
  ]);

  if (!adminCheck.ok) return null;
  const isAdmin = await adminCheck.json().catch(() => false);
  if (isAdmin !== true) return null;

  if (!userRes.ok) return null;
  const user = await userRes.json().catch(() => null);
  if (!user || !user.email) return null;

  let fullName = null;
  try {
    const selfRes = await fetch(`${SUPABASE_URL}/rest/v1/store_admins?id=eq.${encodeURIComponent(user.id)}&select=full_name`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` }
    });
    const selfRows = await selfRes.json().catch(() => []);
    fullName = selfRes.ok && selfRows[0] ? selfRows[0].full_name : null;
  } catch (e) { /* fall back to email below */ }

  const firstName = (fullName || user.email.split('@')[0]).trim().split(/\s+/)[0];
  return { email: user.email, firstName };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!isConfigured() || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    res.status(500).json({ error: 'Not configured' });
    return;
  }

  const authHeader = req.headers.authorization || '';
  const callerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const bookingId = (body.booking_id || '').trim();
  if (!bookingId) {
    res.status(400).json({ error: 'Missing booking_id' });
    return;
  }

  try {
    const admin = await getAdminIdentity(callerToken);
    if (!admin) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    // RLS already lets any store_admin select any booking directly, so a
    // plain authenticated REST read (not the anon key) is enough here —
    // no service-role key needed for this lookup.
    const bookingRes = await fetch(
      `${SUPABASE_URL}/rest/v1/store_bookings?id=eq.${encodeURIComponent(bookingId)}&select=id,meeting_room_name,meeting_room_sid,meeting_status,meeting_scheduled_at,meeting_duration_minutes`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${callerToken}` } }
    );
    const rows = await bookingRes.json();
    const booking = bookingRes.ok && rows[0];

    if (!booking || !booking.meeting_room_name) {
      res.status(404).json({ error: 'No video consultation is scheduled for this booking.' });
      return;
    }
    if (booking.meeting_status === 'ended') {
      res.status(410).json({ error: 'This consultation has ended.' });
      return;
    }

    const room = await findOrCreateRoom(booking.meeting_room_name);
    const scheduledAt = new Date(booking.meeting_scheduled_at);
    const windowEnd = scheduledAt.getTime() + (booking.meeting_duration_minutes || 30) * 60 * 1000;

    const videoToken = buildVideoAccessToken({
      identity: 'Dr. ' + admin.firstName,
      roomName: booking.meeting_room_name,
      ttlSeconds: Math.max(60, Math.ceil((windowEnd - Date.now()) / 1000) + 600)
    });

    // Best-effort — awaited so it completes before this serverless function
    // exits, but a failure here never blocks the call itself from starting.
    await fetch(`${SUPABASE_URL}/rest/v1/store_bookings?id=eq.${encodeURIComponent(bookingId)}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${callerToken}`,
        Prefer: 'return=minimal'
      },
      body: JSON.stringify({ attended_by_name: admin.firstName, attended_by_email: admin.email, attended_at: new Date().toISOString() })
    }).catch(function (err) { console.error('admin-video-token: failed to record attendance', err.message); });

    res.status(200).json({
      accessToken: videoToken,
      roomName: booking.meeting_room_name,
      roomSid: room && room.sid,
      endsAt: new Date(windowEnd).toISOString()
    });
  } catch (err) {
    console.error('admin-video-token: failed', err.message);
    res.status(500).json({ error: 'Could not start the video call.' });
  }
};
