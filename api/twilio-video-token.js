// POST /api/twilio-video-token
// Body: { token, name }
//
// Issues a short-lived Twilio Video Access Token for a patient joining their
// own consultation. `token` is the opaque, unguessable meeting_token minted
// by schedule_booking_meeting (see stripe-webhook.js) — it is the only
// credential a patient ever needs, and it resolves to exactly one booking.
// The join window is enforced here, server-side, independent of anything the
// client claims: 10 minutes before the scheduled start through the end of
// the booked duration.

const { callRpc } = require('./_supabase');
const { isConfigured, buildVideoAccessToken, findOrCreateRoom } = require('./_twilio');

const JOIN_WINDOW_BEFORE_MS = 10 * 60 * 1000;

function escapeIdentity(str) {
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

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const meetingToken = (body.token || '').trim();
  if (!meetingToken) {
    res.status(400).json({ error: 'Missing token' });
    return;
  }

  try {
    const rows = await callRpc('get_booking_by_meeting_token', { p_token: meetingToken });
    const booking = rows && rows[0];
    if (!booking || !booking.meeting_room_name) {
      res.status(404).json({ error: 'This consultation link is invalid or has expired.' });
      return;
    }

    const scheduledAt = new Date(booking.meeting_scheduled_at);
    const durationMs = (booking.meeting_duration_minutes || 30) * 60 * 1000;
    const windowStart = scheduledAt.getTime() - JOIN_WINDOW_BEFORE_MS;
    const windowEnd = scheduledAt.getTime() + durationMs;
    const now = Date.now();

    if (booking.meeting_status === 'ended' || now > windowEnd) {
      res.status(410).json({ error: 'This consultation has ended.', status: 'ended' });
      return;
    }
    if (now < windowStart) {
      res.status(403).json({
        error: 'This consultation hasn\'t started yet. The link becomes active 10 minutes before your scheduled time.',
        status: 'not_yet',
        scheduledAt: booking.meeting_scheduled_at
      });
      return;
    }

    const room = await findOrCreateRoom(booking.meeting_room_name);

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

    const identity = escapeIdentity(body.name || booking.full_name);
    const accessToken = buildVideoAccessToken({
      identity,
      roomName: booking.meeting_room_name,
      ttlSeconds: Math.max(60, Math.ceil((windowEnd - now) / 1000))
    });

    res.status(200).json({
      accessToken,
      roomName: booking.meeting_room_name,
      endsAt: new Date(windowEnd).toISOString(),
      reason: booking.reason
    });
  } catch (err) {
    console.error('twilio-video-token: failed', err.message);
    res.status(500).json({ error: 'Could not start the video call. Please try again in a moment.' });
  }
};
