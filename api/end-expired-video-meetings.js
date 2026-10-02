// GET /api/end-expired-video-meetings
// Called on a schedule by Vercel Cron (see vercel.json) — Vercel signs cron
// requests with a bearer token in CRON_SECRET, which this checks before
// doing anything, so the endpoint can't be triggered by anyone else to mess
// with meeting state.
//
// Finds every booking whose scheduled consultation window has passed but
// which never got explicitly ended (patient/doctor just closed the tab),
// completes the Twilio room so it can't be rejoined, and marks it ended.

const { callRpc } = require('./_supabase');
const { completeRoom } = require('./_twilio');

module.exports = async (req, res) => {
  const authHeader = req.headers.authorization || '';
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const overdue = await callRpc('get_bookings_meeting_overdue', {
      p_webhook_secret: process.env.STOREFRONT_WEBHOOK_SECRET
    });

    let ended = 0;
    for (const booking of overdue || []) {
      await completeRoom(booking.meeting_room_sid || booking.meeting_room_name).catch(function (err) {
        console.error('end-expired-video-meetings: failed to complete room for booking', booking.id, err.message);
      });
      await callRpc('mark_booking_meeting_status', {
        p_booking_id: booking.id,
        p_status: 'ended',
        p_webhook_secret: process.env.STOREFRONT_WEBHOOK_SECRET
      });
      ended += 1;
    }

    res.status(200).json({ ended });
  } catch (err) {
    console.error('end-expired-video-meetings: failed', err.message);
    res.status(500).json({ error: 'Sweep failed' });
  }
};
