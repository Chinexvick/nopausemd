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
      const { kind, record_id: recordId } = session.metadata || {};

      if (kind && recordId) {
        await callRpc('confirm_store_payment', {
          p_kind: kind,
          p_id: recordId,
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
