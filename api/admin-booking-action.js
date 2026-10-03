// POST /api/admin-booking-action
// Header: Authorization: Bearer <website Supabase access token of a store admin>
// Body: { booking_id, action: 'send_invite' | 'reschedule' | 'cancel', ...options }
//
// Staff actions on a consultation that need server-only credentials (email,
// Stripe refunds, Twilio). Called cross-origin from the admin dashboard, so
// CORS is restricted to the dashboard's own origin; every request is also
// verified as a signed-in store_admin before anything happens, and every
// action is written to the admin audit log under the staff member's name.

const Stripe = require('stripe');
const { callRpc } = require('./_supabase');
const { completeRoom } = require('./_twilio');
const { getBooking, prepareMeeting, sendPatientInvite, sendPatientCancellation } = require('./_consultations');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const ALLOWED_ORIGIN = /^https:\/\/(admin\.clinipausemd\.com|clinipausemd-admin(-[a-z0-9-]+)?\.vercel\.app)$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function applyCors(req, res) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGIN.test(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Max-Age', '600');
  }
}

async function isStoreAdmin(accessToken) {
  if (!accessToken) return false;
  const res = await fetch(SUPABASE_URL + '/rest/v1/rpc/is_store_admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + accessToken },
    body: '{}'
  });
  if (!res.ok) return false;
  return (await res.json().catch(function () { return false; })) === true;
}

// Written with the staff member's own token, so the log records who did it.
async function logAction(accessToken, action, bookingId, metadata) {
  try {
    await fetch(SUPABASE_URL + '/rest/v1/rpc/log_admin_action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + accessToken },
      body: JSON.stringify({ p_action: action, p_target: 'booking:' + bookingId, p_metadata: metadata || null })
    });
  } catch (err) {
    console.error('admin-booking-action: audit log failed', err.message);
  }
}

function secret() {
  return process.env.STOREFRONT_WEBHOOK_SECRET;
}

async function sendInvite(bookingId) {
  const before = await getBooking(bookingId);
  if (!before) throw Object.assign(new Error('Booking not found'), { status: 404 });
  if (!before.paid || before.status !== 'confirmed') {
    throw Object.assign(new Error('Only paid, confirmed bookings can be sent a meeting link.'), { status: 400 });
  }
  const b = await prepareMeeting(bookingId);
  await sendPatientInvite(b, before.invite_sent_at ? 'resend' : 'confirmed');
  await callRpc('mark_booking_invite_sent', { p_booking_id: bookingId, p_webhook_secret: secret() });
  return { booking: b, emailed: true };
}

async function reschedule(bookingId, body) {
  const date = String(body.date || '');
  const time = String(body.time || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^(1[0-2]|[1-9]):(00|30) (AM|PM)$/.test(time)) {
    throw Object.assign(new Error('Choose a valid date and time.'), { status: 400 });
  }

  const before = await getBooking(bookingId);
  const b = await callRpc('reschedule_booking_server', {
    p_booking_id: bookingId, p_date: date, p_time: time, p_webhook_secret: secret()
  });

  // Close any room left open for the old time so the new session starts clean.
  if (before && (before.meeting_room_sid || before.meeting_room_name)) {
    await completeRoom(before.meeting_room_sid || before.meeting_room_name).catch(function () {});
  }

  let emailed = false;
  if (body.notify !== false && b.paid && b.status === 'confirmed') {
    const ready = b.meeting_token ? b : await prepareMeeting(bookingId);
    await sendPatientInvite(ready, 'rescheduled');
    await callRpc('mark_booking_invite_sent', { p_booking_id: bookingId, p_webhook_secret: secret() });
    emailed = true;
  }
  return { booking: b, emailed };
}

async function cancel(bookingId, body) {
  const reason = String(body.reason || '').slice(0, 500);
  const before = await getBooking(bookingId);
  if (!before) throw Object.assign(new Error('Booking not found'), { status: 404 });
  if (before.status !== 'confirmed' && before.status !== 'pending_payment') {
    throw Object.assign(new Error('This booking is already cancelled.'), { status: 400 });
  }

  let refunded = false;
  if (body.refund === true && before.paid && before.amount_cents > 0) {
    if (!before.stripe_payment_intent_id) {
      throw Object.assign(new Error('No Stripe payment is linked to this booking, so it can’t be refunded automatically.'), { status: 400 });
    }
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
    try {
      await stripe.refunds.create(
        { payment_intent: before.stripe_payment_intent_id, reason: 'requested_by_customer' },
        { idempotencyKey: 'booking-refund-' + bookingId }
      );
      refunded = true;
    } catch (err) {
      throw Object.assign(new Error('Stripe refund failed: ' + err.message + ' — the booking was not cancelled.'), { status: 502 });
    }
  }

  const b = await callRpc('cancel_booking_server', {
    p_booking_id: bookingId, p_reason: reason, p_refunded: refunded, p_webhook_secret: secret()
  });

  if (before.meeting_room_sid || before.meeting_room_name) {
    await completeRoom(before.meeting_room_sid || before.meeting_room_name).catch(function () {});
  }

  let emailed = false;
  if (body.notify !== false && before.paid) {
    await sendPatientCancellation(b, { refunded, reason });
    emailed = true;
  }
  return { booking: b, emailed, refunded };
}

module.exports = async (req, res) => {
  applyCors(req, res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !secret()) {
    res.status(500).json({ error: 'Not configured' });
    return;
  }

  const authHeader = req.headers.authorization || '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  try {
    if (!(await isStoreAdmin(accessToken))) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
  } catch (err) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  let body = req.body;
  if (!body || typeof body === 'string') {
    try { body = JSON.parse(body || '{}'); } catch (e) { body = {}; }
  }
  const bookingId = String(body.booking_id || '');
  if (!UUID.test(bookingId)) {
    res.status(400).json({ error: 'Invalid booking id' });
    return;
  }

  try {
    let result;
    if (body.action === 'send_invite') {
      result = await sendInvite(bookingId);
    } else if (body.action === 'reschedule') {
      result = await reschedule(bookingId, body);
    } else if (body.action === 'cancel') {
      result = await cancel(bookingId, body);
    } else {
      res.status(400).json({ error: 'Unknown action' });
      return;
    }

    await logAction(accessToken, 'booking.' + body.action, bookingId, {
      date: body.date || null,
      time: body.time || null,
      refunded: result.refunded || false,
      emailed: result.emailed || false
    });

    res.status(200).json({ ok: true, emailed: result.emailed, refunded: result.refunded || false });
  } catch (err) {
    console.error('admin-booking-action:', body.action, 'failed', err.message);
    res.status(err.status || 400).json({ error: err.message || 'Action failed' });
  }
};
