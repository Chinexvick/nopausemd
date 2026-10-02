// GET /api/send-meeting-reminders
// Triggered every minute by a pg_cron job in the website's Supabase project
// — but only on minutes when a reminder is actually due, so it costs nothing
// the rest of the time. Requires Authorization: Bearer <CRON_SECRET>.
//
// claim_due_meeting_reminders atomically marks each booking starting within
// the next 20 minutes as reminded, so overlapping runs can never double-send.
// The patient and the care team each get their own email.

const { callRpc } = require('./_supabase');
const { sendPatientReminder, sendStaffReminder } = require('./_consultations');

module.exports = async (req, res) => {
  const authHeader = req.headers.authorization || '';
  if (!process.env.CRON_SECRET || authHeader !== 'Bearer ' + process.env.CRON_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const due = await callRpc('claim_due_meeting_reminders', {
      p_webhook_secret: process.env.STOREFRONT_WEBHOOK_SECRET
    });
    // A setof-jsonb function may come back as [{...}] or [{fn_name: {...}}].
    const bookings = (Array.isArray(due) ? due : []).map(function (row) {
      return row && row.claim_due_meeting_reminders ? row.claim_due_meeting_reminders : row;
    }).filter(function (b) { return b && b.id; });

    let patientSent = 0;
    let staffSent = 0;
    for (const b of bookings) {
      try {
        await sendPatientReminder(b);
        patientSent += 1;
      } catch (err) {
        console.error('send-meeting-reminders: patient reminder failed for', b.id, err.message);
      }
      try {
        staffSent += await sendStaffReminder(b);
      } catch (err) {
        console.error('send-meeting-reminders: staff reminder failed for', b.id, err.message);
      }
    }

    res.status(200).json({ claimed: bookings.length, patientSent, staffSent });
  } catch (err) {
    console.error('send-meeting-reminders: failed', err.message);
    res.status(500).json({ error: 'Reminder run failed' });
  }
};
