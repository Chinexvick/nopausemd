// POST /api/admin-order-action
// Header: Authorization: Bearer <website Supabase access token of a store admin>
// Body: { order_id, action: 'update_tracking', tracking_status, tracking_carrier,
//         tracking_number, notify }
//
// Updates an order's fulfilment status from the dashboard and, when asked,
// emails the customer a branded update with their tracking link. The update
// itself runs with the staff member's own token, so row-level security
// applies and the status history records who made the change.

const { buildBrandedEmailHtml, sendBrandedEmail } = require('./_email');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const ALLOWED_ORIGIN = /^https:\/\/clinipausemd-admin(-[a-z0-9-]+)?\.vercel\.app$/;
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

module.exports = async (req, res) => {
  applyCors(req, res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) { res.status(500).json({ error: 'Not configured' }); return; }

  const authHeader = req.headers.authorization || '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!(await isStoreAdmin(accessToken).catch(() => false))) {
    res.status(403).json({ error: 'Staff access required' });
    return;
  }

  const body = req.body || {};
  const orderId = String(body.order_id || '');
  if (!UUID.test(orderId)) { res.status(400).json({ error: 'Invalid order' }); return; }
  if (body.action !== 'update_tracking') { res.status(400).json({ error: 'Unknown action' }); return; }

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
      try { emailed = await emailCustomer(order); } catch (err) { console.error('admin-order-action: email failed', err.message); }
    }

    await rest('rpc/log_admin_action', accessToken, {
      method: 'POST',
      body: JSON.stringify({ p_action: 'order_tracking_update', p_target: 'order:' + orderId, p_metadata: { from: before.tracking_status, to: status, emailed } })
    }).catch(() => {});

    res.status(200).json({ order, emailed });
  } catch (err) {
    console.error('admin-order-action error:', err.message);
    res.status(500).json({ error: 'Something went wrong.' });
  }
};
