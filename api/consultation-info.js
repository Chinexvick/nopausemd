// GET /api/consultation-info?t=<meeting_token>
//
// Public, read-only lookup for the patient-facing waiting room
// (consultation.html) to render "your consultation is at 3:00 PM" before the
// join window opens. The token itself is the only credential needed — see
// get_booking_by_meeting_token's own comment for why that's safe (32 random
// bytes, unguessable, resolves to exactly one paid booking).

const { callRpc } = require('./_supabase');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const meetingToken = (req.query.t || '').trim();
  if (!meetingToken) {
    res.status(400).json({ error: 'Missing token' });
    return;
  }

  try {
    const rows = await callRpc('get_booking_by_meeting_token', { p_token: meetingToken });
    const booking = rows && rows[0];
    if (!booking) {
      res.status(404).json({ error: 'This consultation link is invalid or has expired.' });
      return;
    }

    res.status(200).json({
      fullName: booking.full_name,
      reason: booking.reason,
      scheduledAt: booking.meeting_scheduled_at,
      durationMinutes: booking.meeting_duration_minutes,
      status: booking.meeting_status
    });
  } catch (err) {
    console.error('consultation-info: failed', err.message);
    res.status(500).json({ error: 'Could not load your consultation details.' });
  }
};
