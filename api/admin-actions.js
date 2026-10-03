// /api/admin-actions — staff actions from the dashboard that need email.
//
// POST, Authorization: Bearer <website access token of a staff member>
//   { action: 'update_tracking', order_id, tracking_status, tracking_carrier, tracking_number, notify }
//       Updates an order's fulfilment and optionally emails the customer.
//   { action: 'send_broadcast', subject, body, test }
//       Emails the newsletter (or, with test: true, only the sender).
//   { action: 'send_report' }
//       Emails the weekly summary to the notification recipients now.
//
// GET ?job=weekly_report, Authorization: Bearer <CRON_SECRET>
//   Called every Monday morning by a scheduled database job.
//
// Staff actions run with the staff member's own token, so row-level security
// applies and history records who did what.

const { buildBrandedEmailHtml, sendBrandedEmail } = require('./_email');
const { callRpc } = require('./_supabase');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const ALLOWED_ORIGIN = /^https:\/\/(admin\.clinipausemd\.com|clinipausemd-admin(-[a-z0-9-]+)?\.vercel\.app)$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUSES = ['awaiting_fulfillment', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'returned'];

const STATUS_COPY = {
  awaiting_fulfillment: { subject: 'We\'ve received your order', heading: 'Your order is confirmed', line: 'We\'ve received your order and it\'s in the queue to be packed.' },
  processing: { subject: 'Your order is being packed', heading: 'We\'re packing your order', line: 'Good news: our team is preparing your order now.' },
  shipped: { subject: 'Your order is on its way', heading: 'Your order has shipped', line: 'Your order has left us and is on its way to you.' },
  out_for_delivery: { subject: 'Your order arrives today', heading: 'Out for delivery', line: 'Your order is out for delivery and should arrive today.' },
  delivered: { subject: 'Your order was delivered', heading: 'Delivered', line: 'Your order has been delivered. We hope you love it.' },
  returned: { subject: 'Your return has been received', heading: 'Return received', line: 'We\'ve received your returned order. Our team will be in touch if anything else is needed.' }
};

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

function rest(path, accessToken, options) {
  return fetch(SUPABASE_URL + '/rest/v1/' + path, Object.assign({}, options, {
    headers: Object.assign({
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + accessToken
    }, (options && options.headers) || {})
  }));
}

async function isStoreAdmin(accessToken) {
  if (!accessToken) return false;
  const res = await rest('rpc/is_store_admin', accessToken, { method: 'POST', body: '{}' });
  if (!res.ok) return false;
  return (await res.json().catch(() => false)) === true;
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function cleanText(v, max) {
  const s = String(v == null ? '' : v).trim().slice(0, max);
  return s || null;
}

async function emailCustomer(order) {
  const copy = STATUS_COPY[order.tracking_status];
  if (!copy || !order.email || !order.order_number) return false;
  const trackUrl = 'https://www.clinipausemd.com/track-order.html?order=' + encodeURIComponent(order.order_number);
  const carrierLine = order.tracking_number
    ? '<p style="margin:12px 0 0;">' + (order.tracking_carrier ? esc(order.tracking_carrier) + ' tracking number: ' : 'Tracking number: ') + '<strong>' + esc(order.tracking_number) + '</strong></p>'
    : '';
  const html = buildBrandedEmailHtml({
    eyebrow: 'Order ' + esc(order.order_number),
    heading: copy.heading,
    bodyHtml: '<p style="margin:0;">Hi ' + esc((order.customer_name || '').split(' ')[0] || 'there') + ',</p>' +
      '<p style="margin:12px 0 0;">' + copy.line + '</p>' + carrierLine,
    ctaLabel: 'Track your order',
    ctaUrl: trackUrl,
    footerNote: 'Questions about your order? Just reply to this email.'
  });
  await sendBrandedEmail({
    to: order.email,
    subject: copy.subject + ' (' + order.order_number + ')',
    html,
    text: copy.line + (order.tracking_number ? ' Tracking number: ' + order.tracking_number + '.' : '') + ' Track it at ' + trackUrl
  });
  return true;
}

async function updateTracking(req, res, accessToken) {
  const body = req.body || {};
  const orderId = String(body.order_id || '');
  if (!UUID.test(orderId)) { res.status(400).json({ error: 'Invalid order' }); return; }

  const status = String(body.tracking_status || '');
  if (STATUSES.indexOf(status) < 0) { res.status(400).json({ error: 'Invalid status' }); return; }

  try {
    const beforeRes = await rest('store_orders?id=eq.' + orderId + '&select=tracking_status,paid', accessToken);
    const before = (await beforeRes.json())[0];
    if (!before) { res.status(404).json({ error: 'Order not found' }); return; }
    if (!before.paid) { res.status(400).json({ error: 'Only paid orders can be fulfilled.' }); return; }

    const patch = {
      tracking_status: status,
      tracking_carrier: cleanText(body.tracking_carrier, 60),
      tracking_number: cleanText(body.tracking_number, 80)
    };
    const upd = await rest('store_orders?id=eq.' + orderId + '&select=id,order_number,customer_name,email,tracking_status,tracking_carrier,tracking_number,tracking_updated_at,tracking_updated_by', accessToken, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(patch)
    });
    const rows = await upd.json();
    if (!upd.ok || !Array.isArray(rows) || !rows.length) {
      res.status(400).json({ error: 'The order could not be updated.' });
      return;
    }
    const order = rows[0];

    let emailed = false;
    if (body.notify === true && before.tracking_status !== status) {
      try { emailed = await emailCustomer(order); } catch (err) { console.error('admin-actions: order email failed', err.message); }
    }

    await rest('rpc/log_admin_action', accessToken, {
      method: 'POST',
      body: JSON.stringify({ p_action: 'order_tracking_update', p_target: 'order:' + orderId, p_metadata: { from: before.tracking_status, to: status, emailed } })
    }).catch(() => {});

    res.status(200).json({ order, emailed });
  } catch (err) {
    console.error('admin-actions: tracking update failed', err.message);
    res.status(500).json({ error: 'Something went wrong.' });
  }
}

function textToHtml(text) {
  return esc(text).split(/\n{2,}/).map((p) => '<p style="margin:0 0 14px;">' + p.replace(/\n/g, '<br>') + '</p>').join('');
}

async function sendBroadcast(req, res, accessToken) {
  const body = req.body || {};
  const subject = String(body.subject || '').trim().slice(0, 200);
  const text = String(body.body || '').trim().slice(0, 20000);
  if (subject.length < 3 || text.length < 10) { res.status(400).json({ error: 'Add a subject and a message.' }); return; }

  const html = (unsubUrl) => buildBrandedEmailHtml({
    eyebrow: 'CliniPause',
    heading: esc(subject),
    bodyHtml: textToHtml(text),
    ctaLabel: 'Visit CliniPause',
    ctaUrl: 'https://www.clinipausemd.com/',
    footerNote: 'You are receiving this because you subscribed at clinipausemd.com. <a href="' + unsubUrl + '" style="color:inherit;">Unsubscribe</a>'
  });

  if (body.test === true) {
    const userRes = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + accessToken } });
    const user = await userRes.json().catch(() => ({}));
    if (!user.email) { res.status(400).json({ error: 'Could not find your email address.' }); return; }
    await sendBrandedEmail({ to: user.email, subject: '[Test] ' + subject, html: html('https://www.clinipausemd.com/unsubscribe.html'), text });
    res.status(200).json({ test: true, sent: 1, to: user.email });
    return;
  }

  const startRes = await rest('rpc/start_newsletter_broadcast', accessToken, { method: 'POST', body: JSON.stringify({ p_subject: subject, p_body: text }) });
  const started = await startRes.json().catch(() => ({}));
  if (!startRes.ok) { res.status(400).json({ error: started.message || 'Could not start the broadcast.' }); return; }

  const audience = Array.isArray(started.audience) ? started.audience : [];
  let sent = 0;
  let failed = 0;
  const queue = audience.slice();
  async function worker() {
    while (queue.length) {
      const r = queue.shift();
      const unsubUrl = 'https://www.clinipausemd.com/unsubscribe.html?t=' + encodeURIComponent(r.token);
      try {
        await sendBrandedEmail({
          to: r.email, subject, html: html(unsubUrl),
          text: text + '\n\nUnsubscribe: ' + unsubUrl,
          headers: { 'List-Unsubscribe': '<' + unsubUrl + '>' }
        });
        sent += 1;
      } catch (err) {
        failed += 1;
        console.error('admin-actions: broadcast email failed', err.message);
      }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  await rest('rpc/finish_newsletter_broadcast', accessToken, { method: 'POST', body: JSON.stringify({ p_id: started.id, p_sent: sent, p_failed: failed }) }).catch(() => {});
  res.status(200).json({ sent, failed });
}

function money(cents) {
  return '$' + (Number(cents || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function sendWeeklyReport(force) {
  const r = await callRpc('weekly_report_server', { p_webhook_secret: process.env.STOREFRONT_WEBHOOK_SECRET, p_force: !!force });
  if (!r || r.enabled === false) return { skipped: true };
  const to = Array.isArray(r.recipients) ? r.recipients : [];
  if (!to.length) return { skipped: true, reason: 'No notification recipients' };

  const row = (label, value) => '<tr><td style="padding:6px 0;color:#555;">' + label + '</td><td style="padding:6px 0;text-align:right;font-weight:600;">' + value + '</td></tr>';
  const team = (r.team || []).map((t) => row(esc(t.name), t.count + ' action' + (t.count === 1 ? '' : 's'))).join('') || row('No staff activity recorded', '');
  const html = buildBrandedEmailHtml({
    eyebrow: 'Weekly summary',
    heading: 'Your CliniPause week',
    bodyHtml:
      '<table style="width:100%;border-collapse:collapse;font-size:15px;">' +
      row('Shop sales', money(r.shop_sales_cents) + ' (' + r.shop_orders + ' orders)') +
      row('Consultation sales', money(r.consult_sales_cents) + ' (' + r.consults_booked + ' booked)') +
      row('Consultations held', r.consults_held + (r.no_shows ? ' · ' + r.no_shows + ' no-show' : '')) +
      row('Booked for the next 7 days', r.upcoming_7d) +
      row('Orders waiting to ship', r.orders_to_fulfil) +
      row('Website chats', r.chats + ' (' + r.chat_handoffs + ' asked for a person)') +
      (r.chat_first_reply_min != null ? row('Average first reply', r.chat_first_reply_min + ' min') : '') +
      row('Contact messages', r.contact_messages) +
      row('Speaking requests', r.speaking_requests) +
      row('New newsletter subscribers', r.new_subscribers) +
      '</table><h3 style="font-size:15px;margin:22px 0 6px;">Team activity</h3><table style="width:100%;border-collapse:collapse;font-size:15px;">' + team + '</table>',
    ctaLabel: 'Open the dashboard',
    ctaUrl: 'https://admin.clinipausemd.com/overview.html',
    footerNote: 'Sent every Monday morning. Turn it off in Admin Settings.'
  });
  await sendBrandedEmail({ to: to.join(', '), subject: 'CliniPause weekly summary', html, text: 'Your CliniPause weekly summary is ready in the dashboard.' });
  return { sent: to.length };
}

module.exports = async (req, res) => {
  applyCors(req, res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) { res.status(500).json({ error: 'Not configured' }); return; }

  const authHeader = req.headers.authorization || '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (req.method === 'GET') {
    if (!process.env.CRON_SECRET || authHeader !== 'Bearer ' + process.env.CRON_SECRET || req.query.job !== 'weekly_report') {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    try { res.status(200).json(await sendWeeklyReport(false)); } catch (err) {
      console.error('admin-actions: weekly report failed', err.message);
      res.status(500).json({ error: 'Report failed' });
    }
    return;
  }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  if (!(await isStoreAdmin(accessToken).catch(() => false))) {
    res.status(403).json({ error: 'Staff access required' });
    return;
  }

  const action = (req.body || {}).action;
  try {
    if (action === 'update_tracking') return await updateTracking(req, res, accessToken);
    if (action === 'send_broadcast') return await sendBroadcast(req, res, accessToken);
    if (action === 'send_report') {
      const out = await sendWeeklyReport(true);
      await rest('rpc/log_admin_action', accessToken, { method: 'POST', body: JSON.stringify({ p_action: 'weekly_report_sent', p_target: 'report:weekly', p_metadata: out }) }).catch(() => {});
      res.status(200).json(out);
      return;
    }
    res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('admin-actions error:', err.message);
    res.status(500).json({ error: 'Something went wrong.' });
  }
};
