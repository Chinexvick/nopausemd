// Everything a video consultation needs after the booking row exists:
// preparing its meeting link, and every email a patient or the care team
// receives about it. Used by the Stripe webhook, the free-booking path in
// create-checkout-session, the reminder cron, and admin booking actions.
//
// All patient-supplied text is HTML-escaped before it goes into an email.

const { callRpc } = require('./_supabase');
const { buildBrandedEmailHtml, sendBrandedEmail } = require('./_email');
const { buildConsultationIcs } = require('./_ics');

const CLINIC_TZ = 'America/New_York';
const WEBSITE_URL = 'https://www.clinipausemd.com';
const ADMIN_URL = 'https://clinipausemd-admin.vercel.app';
const JOIN_OPENS_MINUTES_BEFORE = 10;
const CLINICIAN = 'Dr. Ivanah Thomas';
const PATIENT_FOOTER = "You're receiving this email because you booked a consultation at clinipausemd.com.";
const STAFF_FOOTER = 'Internal notification for the CliniPause care team.';

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function secret() {
  return process.env.STOREFRONT_WEBHOOK_SECRET;
}

// ---------- clinic-time formatting ----------

function part(date, options) {
  return new Intl.DateTimeFormat('en-US', Object.assign({ timeZone: CLINIC_TZ }, options)).format(date);
}

function tzAbbrev(date) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: CLINIC_TZ, timeZoneName: 'short' }).formatToParts(date);
  const tz = parts.find(function (p) { return p.type === 'timeZoneName'; });
  return tz ? tz.value : 'ET';
}

function fmtDay(date) {
  return part(date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function fmtTime(date) {
  return part(date, { hour: 'numeric', minute: '2-digit' });
}

function times(b) {
  const start = new Date(b.starts_at);
  const end = new Date(b.ends_at || (start.getTime() + (b.duration_minutes || 30) * 60000));
  return {
    start,
    end,
    day: fmtDay(start),
    range: fmtTime(start) + ' – ' + fmtTime(end) + ' ' + tzAbbrev(start),
    opensAt: fmtTime(new Date(start.getTime() - JOIN_OPENS_MINUTES_BEFORE * 60000))
  };
}

function money(cents) {
  return Number(cents) === 0 ? 'Complimentary' : '$' + (Number(cents || 0) / 100).toFixed(2);
}

// ---------- links ----------

function patientJoinUrl(b) {
  return WEBSITE_URL + '/consultation.html?t=' + encodeURIComponent(b.meeting_token);
}

function adminJoinUrl(b) {
  return ADMIN_URL + '/video-call.html?booking_id=' + encodeURIComponent(b.id);
}

function adminBookingUrl(b) {
  return ADMIN_URL + '/bookings.html?booking=' + encodeURIComponent(b.id);
}

// ---------- email building blocks ----------

function paragraph(html) {
  return '<p style="margin:0 0 18px; font-size:15px; line-height:1.7; color:#3a3f42;">' + html + '</p>';
}

function smallNote(html) {
  return '<p style="margin:0 0 16px; font-size:13px; line-height:1.6; color:#6b7176;">' + html + '</p>';
}

function detailsTable(rows) {
  const body = rows.map(function (row, i) {
    const border = i < rows.length - 1 ? 'border-bottom:1px solid #eef0f2;' : '';
    return '<tr>' +
      '<td style="padding:12px 16px; font-size:13px; color:#8a9199; width:34%; vertical-align:top; ' + border + '">' + esc(row[0]) + '</td>' +
      '<td style="padding:12px 16px; font-size:14px; color:#121212; font-weight:600; vertical-align:top; ' + border + '">' + row[1] + '</td>' +
    '</tr>';
  }).join('');
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px; border:1px solid #eef0f2; border-radius:14px; border-collapse:separate;">' + body + '</table>';
}

function tipsBox() {
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 18px; background:#f4f9f0; border-radius:14px;">' +
    '<tr><td style="padding:16px 18px; font-size:13px; line-height:1.8; color:#2f4a24;">' +
      '<strong style="display:block; margin-bottom:4px;">Before your call</strong>' +
      '&#10003; Use Chrome or Safari on your phone, tablet, or computer — nothing to download<br>' +
      '&#10003; Allow camera and microphone access when your browser asks<br>' +
      '&#10003; Find a quiet, private, well-lit space' +
    '</td></tr></table>';
}

function icsAttachment(b, opts) {
  const t = times(b);
  const ics = buildConsultationIcs({
    uid: 'consultation-' + b.id + '@clinipausemd.com',
    startsAt: t.start,
    endsAt: t.end,
    summary: 'Video consultation with ' + CLINICIAN,
    description: (opts && opts.cancelled)
      ? 'This consultation has been cancelled.'
      : 'Join your secure video consultation: ' + patientJoinUrl(b) + '\nThe link opens ' + JOIN_OPENS_MINUTES_BEFORE + ' minutes before your start time.',
    url: (opts && opts.cancelled) ? null : patientJoinUrl(b),
    sequence: Math.floor(Date.now() / 1000),
    cancelled: !!(opts && opts.cancelled)
  });
  return {
    filename: (opts && opts.cancelled) ? 'consultation-cancelled.ics' : 'consultation.ics',
    content: ics,
    contentType: 'text/calendar; charset=utf-8; method=' + ((opts && opts.cancelled) ? 'CANCEL' : 'PUBLISH')
  };
}

async function getAdminRecipients() {
  const recipients = await callRpc('get_active_notification_recipients', { p_webhook_secret: secret() });
  return Array.isArray(recipients) ? recipients : [];
}

// ---------- meeting preparation ----------

async function prepareMeeting(bookingId) {
  return callRpc('prepare_booking_meeting', { p_booking_id: bookingId, p_webhook_secret: secret() });
}

async function getBooking(bookingId) {
  return callRpc('get_booking_server', { p_booking_id: bookingId, p_webhook_secret: secret() });
}

// ---------- patient emails ----------

// kind: 'confirmed' (first email after payment), 'rescheduled', or 'resend'.
async function sendPatientInvite(b, kind) {
  const t = times(b);
  const first = esc(b.first_name || 'there');
  const copy = {
    confirmed: {
      eyebrow: 'CONSULTATION CONFIRMED',
      heading: "You're booked, " + first + '!',
      intro: 'Your video consultation with ' + CLINICIAN + ' is confirmed. Everything you need is below.',
      subject: 'Confirmed: your consultation on ' + t.day
    },
    rescheduled: {
      eyebrow: 'NEW TIME CONFIRMED',
      heading: 'Your consultation has a new time',
      intro: 'Hi ' + first + ', your video consultation with ' + CLINICIAN + ' has been moved. Here are the updated details — your join link stays the same.',
      subject: 'Rescheduled: your consultation is now ' + t.day
    },
    resend: {
      eyebrow: 'YOUR CONSULTATION LINK',
      heading: 'Here’s your consultation link',
      intro: 'Hi ' + first + ', here are the details and your personal link for your video consultation with ' + CLINICIAN + '.',
      subject: 'Your consultation link for ' + t.day
    }
  }[kind] || {};

  const body =
    paragraph(copy.intro) +
    detailsTable([
      ['Date', esc(t.day)],
      ['Time', esc(t.range)],
      ['Length', esc(b.duration_minutes + ' minutes')],
      ['With', esc(CLINICIAN)],
      ['Topic', esc(b.reason || 'General wellness consultation')],
      ['Where', 'Secure video call — no app needed']
    ]) +
    smallNote('Your link opens at <strong>' + esc(t.opensAt) + '</strong> (' + JOIN_OPENS_MINUTES_BEFORE + ' minutes before your start time), and the call ends automatically after ' + esc(b.duration_minutes) + ' minutes. A calendar invite is attached.');

  const after =
    tipsBox() +
    smallNote('Need to reschedule? Reply to this email or write to <a href="mailto:info@clinipausemd.com" style="color:#6cbf3d;">info@clinipausemd.com</a> at least 24 hours before your appointment.');

  const html = buildBrandedEmailHtml({
    eyebrow: copy.eyebrow,
    heading: copy.heading,
    bodyHtml: body,
    ctaLabel: 'Join Your Video Consultation',
    ctaUrl: patientJoinUrl(b),
    afterCtaHtml: after,
    footerNote: PATIENT_FOOTER
  });

  await sendBrandedEmail({
    to: b.email,
    subject: copy.subject,
    html,
    text: copy.intro.replace(/<[^>]+>/g, '') + '\n\n' + t.day + ', ' + t.range + ' (' + b.duration_minutes + ' minutes)\nJoin: ' + patientJoinUrl(b) + '\nYour link opens at ' + t.opensAt + '.',
    attachments: [icsAttachment(b)]
  });
}

async function sendPatientReminder(b) {
  const t = times(b);
  const html = buildBrandedEmailHtml({
    eyebrow: 'STARTING SOON',
    heading: 'Your consultation starts in 20 minutes',
    bodyHtml:
      paragraph('Hi ' + esc(b.first_name || 'there') + ', ' + esc(CLINICIAN) + ' will see you shortly.') +
      detailsTable([
        ['Time', esc(t.range)],
        ['Length', esc(b.duration_minutes + ' minutes')],
        ['Topic', esc(b.reason || 'General wellness consultation')]
      ]) +
      smallNote('The button below works from <strong>' + esc(t.opensAt) + '</strong>. If you arrive early, the page will open automatically when it’s time.') +
      tipsBox(),
    ctaLabel: 'Join Your Video Consultation',
    ctaUrl: patientJoinUrl(b),
    footerNote: PATIENT_FOOTER
  });

  await sendBrandedEmail({
    to: b.email,
    subject: 'Starting in 20 minutes: your consultation with ' + CLINICIAN,
    html,
    text: 'Your consultation starts at ' + t.range + '. Join: ' + patientJoinUrl(b) + ' (opens at ' + t.opensAt + ')'
  });
}

async function sendPatientCancellation(b, opts) {
  const t = times(b);
  const refunded = opts && opts.refunded;
  const reason = opts && opts.reason;
  const html = buildBrandedEmailHtml({
    eyebrow: 'CONSULTATION CANCELLED',
    heading: 'Your consultation has been cancelled',
    bodyHtml:
      paragraph('Hi ' + esc(b.first_name || 'there') + ', your ' + esc(b.duration_minutes) + '-minute video consultation on <strong>' + esc(t.day) + '</strong> at ' + esc(t.range) + ' has been cancelled.') +
      (reason ? detailsTable([['Note from the clinic', esc(reason)]]) : '') +
      (refunded
        ? paragraph('A full refund of <strong>' + esc(money(b.amount_cents)) + '</strong> has been issued to your original payment method. It usually appears within 5–10 business days.')
        : '') +
      paragraph('We’d love to see you at another time — you can pick a new slot below, or reply to this email and we’ll help.'),
    ctaLabel: 'Book a New Time',
    ctaUrl: WEBSITE_URL + '/?book=1',
    footerNote: PATIENT_FOOTER
  });

  await sendBrandedEmail({
    to: b.email,
    subject: 'Cancelled: your consultation on ' + t.day,
    html,
    text: 'Your consultation on ' + t.day + ' at ' + t.range + ' has been cancelled.' + (refunded ? ' A full refund has been issued.' : '') + ' Book a new time: ' + WEBSITE_URL + '/?book=1',
    attachments: [icsAttachment(b, { cancelled: true })]
  });
}

// ---------- care-team emails ----------

async function sendStaffEmail(subject, html, text) {
  const recipients = await getAdminRecipients();
  if (!recipients.length) return 0;
  const results = await Promise.allSettled(recipients.map(function (to) {
    return sendBrandedEmail({ to, subject, html, text });
  }));
  results.forEach(function (r) {
    if (r.status === 'rejected') console.error('consultations: staff email failed', r.reason && r.reason.message);
  });
  return results.filter(function (r) { return r.status === 'fulfilled'; }).length;
}

function staffPatientRows(b, t) {
  return [
    ['Patient', esc(b.full_name)],
    ['When', esc(t.day) + '<br>' + esc(t.range)],
    ['Length', esc(b.duration_minutes + ' minutes')],
    ['Topic', esc(b.reason || 'General wellness consultation')],
    ['Email', '<a href="mailto:' + esc(b.email) + '" style="color:#2f6b1d;">' + esc(b.email) + '</a>'],
    ['Phone', '<a href="tel:' + esc(b.phone) + '" style="color:#2f6b1d;">' + esc(b.phone) + '</a>'],
    ['Fee', esc(money(b.amount_cents))]
  ];
}

async function notifyStaffNewBooking(b) {
  const t = times(b);
  const html = buildBrandedEmailHtml({
    eyebrow: 'NEW BOOKING',
    heading: esc(b.full_name) + ' booked a ' + esc(b.duration_minutes) + '-minute consultation',
    bodyHtml: detailsTable(staffPatientRows(b, t)) + smallNote('The patient has been sent their confirmation, calendar invite, and personal video link.'),
    ctaLabel: 'View Booking',
    ctaUrl: adminBookingUrl(b),
    footerNote: STAFF_FOOTER
  });
  return sendStaffEmail(
    'New booking: ' + b.full_name + ' — ' + t.day + ', ' + fmtTime(t.start),
    html,
    b.full_name + ' booked a ' + b.duration_minutes + '-minute consultation for ' + t.day + ', ' + t.range + '. ' + adminBookingUrl(b)
  );
}

async function sendStaffReminder(b) {
  const t = times(b);
  const html = buildBrandedEmailHtml({
    eyebrow: 'UP NEXT — 20 MINUTES',
    heading: esc(b.full_name) + ' at ' + esc(fmtTime(t.start)),
    bodyHtml:
      paragraph('A video consultation starts in 20 minutes. The patient has received their own reminder with their join link.') +
      detailsTable(staffPatientRows(b, t)) +
      smallNote('<a href="' + esc(adminBookingUrl(b)) + '" style="color:#2f6b1d;">Open the booking in the dashboard</a> to review notes before the call.'),
    ctaLabel: 'Join as Clinician',
    ctaUrl: adminJoinUrl(b),
    footerNote: STAFF_FOOTER
  });
  return sendStaffEmail(
    'In 20 minutes: ' + b.full_name + ' (' + t.range + ')',
    html,
    'Consultation with ' + b.full_name + ' starts at ' + t.range + '. Join as clinician: ' + adminJoinUrl(b)
  );
}

// ---------- flows ----------

// After a booking is paid (or confirmed free): give it a meeting link, send
// the patient their confirmation + calendar invite, and tell the care team.
// Idempotent across Stripe webhook retries — emails only go out once.
// Never throws: the payment is already recorded by the time this runs.
async function handleConfirmedBooking(bookingId) {
  try {
    const b = await prepareMeeting(bookingId);
    if (b.invite_sent_at) return b;

    await sendPatientInvite(b, 'confirmed');
    await callRpc('mark_booking_invite_sent', { p_booking_id: bookingId, p_webhook_secret: secret() });
    await notifyStaffNewBooking(b).catch(function (err) {
      console.error('consultations: staff new-booking email failed', err.message);
    });
    return b;
  } catch (err) {
    console.error('consultations: handleConfirmedBooking failed for', bookingId, err.message);
    return null;
  }
}

module.exports = {
  CLINIC_TZ,
  esc,
  times,
  money,
  prepareMeeting,
  getBooking,
  handleConfirmedBooking,
  sendPatientInvite,
  sendPatientReminder,
  sendPatientCancellation,
  sendStaffReminder,
  notifyStaffNewBooking
};
