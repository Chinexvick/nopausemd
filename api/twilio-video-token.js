// POST /api/twilio-video-token
// Body: { token }
//
// Issues a short-lived Twilio Video Access Token for a patient joining their
// own consultation. `token` is the opaque, unguessable meeting token from
// their confirmation email — the only credential a patient ever needs, and
// it resolves to exactly one paid booking. The join window is enforced here,
// server-side, independent of the patient's own clock: 10 minutes before the
// scheduled start through the end of the booked duration.

const { callRpc } = require('./_supabase');
const { isConfigured, buildVideoAccessToken, findOrCreateRoom } = require('./_twilio');

const JOIN_WINDOW_BEFORE_MS = 10 * 60 * 1000;

function safeIdentity(str) {
  return String(str || 'Patient').replace(/[^a-zA-Z0-9 ._-]/g, '').slice(0, 60) || 'Patient';
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!isConfigured()) {
    res.status(500).json({ error: 'Video calling is not configured yet.' });
    return;
  }

  let body = req.body;
  if (!body || typeof body === 'string') {
    try { body = JSON.parse(body || '{}'); } catch (e) { body = {}; }
  }
  const meetingToken = String(body.token || '').trim();
  if (!meetingToken) {
    res.status(400).json({ error: 'Missing token' });
    return;
  }

  try {
    const booking = await callRpc('get_consultation_by_token', { p_token: meetingToken });
    if (!booking || !booking.meeting_room_name) {
      res.status(404).json({ error: 'This consultation link is invalid or has expired.' });
      return;
    }
    if (booking.booking_status === 'cancelled' || booking.booking_status === 'refunded') {
      res.status(410).json({ error: 'This consultation was cancelled.', status: 'cancelled' });
      return;
    }

    const startsAt = new Date(booking.starts_at).getTime();
    const windowStart = startsAt - JOIN_WINDOW_BEFORE_MS;
    const windowEnd = startsAt + booking.duration_minutes * 60000;
    const now = Date.now();

    if (booking.meeting_status === 'ended' || now > windowEnd) {
      res.status(410).json({ error: 'This consultation has ended.', status: 'ended' });
      return;
    }
    if (now < windowStart) {
      res.status(403).json({
        error: 'Your consultation room opens 10 minutes before your start time.',
        status: 'not_yet',
        opensAt: new Date(windowStart).toISOString()
      });
      return;
    }

    const room = await findOrCreateRoom(booking.meeting_room_name, { endsAt: new Date(windowEnd) });

    if (booking.meeting_status !== 'active') {
      await callRpc('mark_booking_meeting_status', {
        p_booking_id: booking.id,
        p_status: 'active',
        p_webhook_secret: process.env.STOREFRONT_WEBHOOK_SECRET
      });
    }
    if (room && room.sid && room.sid !== booking.meeting_room_sid) {
      await callRpc('mark_booking_meeting_room', {
        p_booking_id: booking.id,
        p_room_sid: room.sid,
        p_webhook_secret: process.env.STOREFRONT_WEBHOOK_SECRET
      }).catch(function () {});
    }

    const accessToken = buildVideoAccessToken({
      identity: safeIdentity(booking.first_name) + ' (patient)',
      roomName: booking.meeting_room_name,
      ttlSeconds: Math.max(60, Math.ceil((windowEnd - now) / 1000))
    });

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      accessToken,
      roomName: booking.meeting_room_name,
      endsAt: new Date(windowEnd).toISOString()
    });
  } catch (err) {
    console.error('twilio-video-token: failed', err.message);
    res.status(500).json({ error: 'Could not start the video call. Please try again in a moment.' });
  }
};
