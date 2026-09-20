// POST /api/stripe-webhook
//
// This is the ONLY place a booking or order is ever marked as paid.
// Stripe's signature is verified against the raw request body before
// anything else happens, so a request cannot reach the database update
// unless it was genuinely signed by Stripe with our webhook secret.

const Stripe = require('stripe');
const { callRpc } = require('./_supabase');

module.exports.config = { api: { bodyParser: false } };

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).end();
    return;
  }

  if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
    console.error('stripe-webhook: missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET');
    res.status(500).end();
    return;
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
  const rawBody = await readRawBody(req);
  const signature = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('stripe-webhook: signature verification failed', err.message);
    res.status(400).send(`Webhook signature verification failed`);
    return;
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const metadata = session.metadata || {};
      const details = session.customer_details || {};
      const shipping = session.shipping_details || details;

      if (metadata.kind === 'booking' && metadata.record_id) {
        await callRpc('confirm_store_payment', {
          p_kind: 'booking',
          p_id: metadata.record_id,
          p_checkout_session_id: session.id,
          p_payment_intent_id: session.payment_intent || null,
          p_webhook_secret: process.env.STOREFRONT_WEBHOOK_SECRET
        });
      } else if (metadata.kind === 'order' && metadata.record_id) {
        // Back-compat for any in-flight sessions created before this deploy.
        await callRpc('confirm_store_payment', {
          p_kind: 'order',
          p_id: metadata.record_id,
          p_checkout_session_id: session.id,
          p_payment_intent_id: session.payment_intent || null,
          p_webhook_secret: process.env.STOREFRONT_WEBHOOK_SECRET
        });
      } else if (metadata.kind === 'order') {
        // One-click flow: this webhook call is what actually creates the
        // order row (already paid) — see create_paid_order in the DB.
        let items = [];
        try { items = JSON.parse(metadata.items || '[]'); } catch (e) { items = []; }

        await callRpc('create_paid_order', {
          p_site: metadata.site,
          p_customer_name: details.name || null,
          p_email: details.email || null,
          p_phone: details.phone || null,
          p_shipping_address: shipping.address || null,
          p_items: items,
          p_checkout_session_id: session.id,
          p_payment_intent_id: session.payment_intent || null,
          p_webhook_secret: process.env.STOREFRONT_WEBHOOK_SECRET
        });
      }
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('stripe-webhook: failed to record payment', err.message);
    // Ask Stripe to retry — the row should never silently stay unpaid on our error.
    res.status(500).json({ error: 'Failed to record payment' });
  }
};
