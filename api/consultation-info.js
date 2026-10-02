// GET /api/consultation-info?t=<meeting_token>
//
// Public, read-only lookup for the patient-facing waiting room
// (consultation.html). The token itself is the only credential needed — it's
// 32 random bytes, unguessable, and resolves to exactly one paid booking.
// Only what the waiting room displays is returned; the room name stays
// server-side.

const { callRpc } = require('./_supabase');

const JOIN_OPENS_MINUTES_BEFORE = 10;

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const meetingToken = String(req.query.t || '').trim();
  if (!meetingToken) {
    res.status(400).json({ error: 'Missing token' });
    return;
  }

  try {
    const booking = await callRpc('get_consultation_by_token', { p_token: meetingToken });
    if (!booking) {
      res.status(404).json({ error: 'This consultation link is invalid or has expired.' });
      return;
    }

    const startsAt = new Date(booking.starts_at);
    const endsAt = new Date(startsAt.getTime() + booking.duration_minutes * 60000);
    const cancelled = booking.booking_status === 'cancelled' || booking.booking_status === 'refunded';
    const ended = booking.meeting_status === 'ended' || Date.now() > endsAt.getTime();

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      firstName: booking.first_name,
      reason: booking.reason,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      opensAt: new Date(startsAt.getTime() - JOIN_OPENS_MINUTES_BEFORE * 60000).toISOString(),
      durationMinutes: booking.duration_minutes,
      status: cancelled ? 'cancelled' : (ended ? 'ended' : booking.meeting_status),
      serverNow: new Date().toISOString()
    });
  } catch (err) {
    console.error('consultation-info: failed', err.message);
    res.status(500).json({ error: 'Could not load your consultation details.' });
  }
};
