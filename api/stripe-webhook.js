// POST /api/stripe-webhook
//
// This is the ONLY place a booking or order is ever marked as paid.
// Stripe's signature is verified against the raw request body before
// anything else happens, so a request cannot reach the database update
// unless it was genuinely signed by Stripe with our webhook secret.

const Stripe = require('stripe');
const { callRpc, select } = require('./_supabase');
const { buildBrandedEmailHtml, sendBrandedEmail } = require('./_email');

module.exports.config = { api: { bodyParser: false } };

const ADMIN_DASHBOARD_URL = 'https://clinipausemd-admin.vercel.app';

function firstName(fullName) {
  var trimmed = (fullName || '').trim();
  if (!trimmed) return 'Someone';
  return trimmed.split(/\s+/)[0];
}

function money(cents) {
  return '$' + (Number(cents || 0) / 100).toFixed(2);
}

// Best-effort product-name + amount lookup for the notification preview
// line. Falls back to generic values rather than throwing — this is cosmetic
// only, never load-bearing for the payment record itself.
async function summarizeItems(items) {
  try {
    if (!items || !items.length) return { summary: 'Store order', amountCents: 0 };
    const names = [];
    let amountCents = 0;
    for (const item of items) {
      const rows = await select('store_products', `id=eq.${encodeURIComponent(item.product_id)}&select=name,price_cents`);
      const product = rows[0];
      const quantity = Number(item.quantity) || 1;
      names.push(product ? (product.name + (quantity > 1 ? ' ×' + quantity : '')) : 'Item');
      if (product) amountCents += product.price_cents * quantity;
    }
    return { summary: names.join(', '), amountCents };
  } catch (e) {
    return { summary: 'Store order', amountCents: 0 };
  }
}

// Best-effort "new order/booking" notification to every active internal
// recipient (see notification_recipients / get_active_notification_recipients
// in the DB). Never throws — a failure here must never affect the webhook's
// response to Stripe or the payment record that was already saved.
async function notifyNewSale({ recordType, recordId, customerName, summary, amountCents }) {
  try {
    const recipients = await callRpc('get_active_notification_recipients', {
      p_webhook_secret: process.env.STOREFRONT_WEBHOOK_SECRET
    });
    if (!Array.isArray(recipients) || recipients.length === 0) return;

    const isBooking = recordType === 'booking';
    const heading = isBooking ? 'New Booking' : 'New Order';
    const previewLine = `New ${isBooking ? 'booking' : 'order'} from ${firstName(customerName)} — ${summary} — ${money(amountCents)}`;
    const detailUrl = `${ADMIN_DASHBOARD_URL}/order-detail.html?id=${encodeURIComponent(recordId)}&type=${isBooking ? 'booking' : 'order'}`;

    const html = buildBrandedEmailHtml({
      eyebrow: isBooking ? 'NEW BOOKING' : 'NEW ORDER',
      heading,
      bodyHtml: `<p style="margin:0 0 28px; font-size:15px; line-height:1.7; color:#3a3f42;">${previewLine}</p>`,
      ctaLabel: 'View Order in Dashboard',
      ctaUrl: detailUrl
    });

    const results = await Promise.allSettled(
      recipients.map((email) => sendBrandedEmail({
        to: email,
        subject: `${heading}: ${previewLine}`,
        html,
        text: `${previewLine}\n\nView in the admin dashboard: ${detailUrl}`
      }))
    );
    results.forEach((r) => {
      if (r.status === 'rejected') {
        console.error('stripe-webhook: notification email failed', r.reason && r.reason.message);
      }
    });
  } catch (err) {
    console.error('stripe-webhook: notifyNewSale failed', err.message);
  }
}

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

        await notifyNewSale({
          recordType: 'booking',
          recordId: metadata.record_id,
          customerName: details.name,
          summary: 'Consultation booking',
          amountCents: session.amount_total
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

        await notifyNewSale({
          recordType: 'order',
          recordId: metadata.record_id,
          customerName: details.name,
          summary: 'Store order',
          amountCents: session.amount_total
        });
      } else if (metadata.kind === 'order' && metadata.recurring === '1') {
        // Subscription checkout: at least one cart item was "Subscribe &
        // save". Each recurring line item becomes its own subscription
        // record (they all share the same underlying Stripe subscription).
        let items = [];
        try { items = JSON.parse(metadata.items || '[]'); } catch (e) { items = []; }
        const recurringItems = items.filter((i) => i.recurring);

        for (const item of recurringItems) {
          const result = await callRpc('create_paid_subscription', {
            p_site: metadata.site,
            p_customer_name: details.name || null,
            p_email: details.email || null,
            p_phone: details.phone || null,
            p_shipping_address: shipping.address || null,
            p_product_id: item.product_id,
            p_quantity: item.quantity,
            p_stripe_customer_id: session.customer || null,
            p_stripe_subscription_id: session.subscription || null,
            p_checkout_session_id: session.id,
            p_payment_intent_id: session.payment_intent || null,
            p_webhook_secret: process.env.STOREFRONT_WEBHOOK_SECRET
          });

          // create_paid_subscription returns { subscription_id, order_id } —
          // it also creates a linked store_orders row in the same call, and
          // that order_id is what order-detail.html can actually open.
          const orderId = result && result.order_id;
          if (orderId) {
            const itemSummary = await summarizeItems([item]);
            await notifyNewSale({
              recordType: 'order',
              recordId: orderId,
              customerName: details.name,
              summary: itemSummary.summary + ' (subscription)',
              amountCents: itemSummary.amountCents
            });
          }
        }
      } else if (metadata.kind === 'order') {
        // One-click flow: this webhook call is what actually creates the
        // order row (already paid) — see create_paid_order in the DB.
        let items = [];
        try { items = JSON.parse(metadata.items || '[]'); } catch (e) { items = []; }

        const orderId = await callRpc('create_paid_order', {
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

        if (orderId) {
          const itemSummary = await summarizeItems(items);
          await notifyNewSale({
            recordType: 'order',
            recordId: orderId,
            customerName: details.name,
            summary: itemSummary.summary,
            amountCents: session.amount_total || itemSummary.amountCents
          });
        }
      }
    } else if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object;
      if (invoice.subscription && invoice.billing_reason === 'subscription_cycle') {
        await callRpc('record_subscription_renewal', {
          p_stripe_subscription_id: invoice.subscription,
          p_checkout_session_id: invoice.id,
          p_payment_intent_id: invoice.payment_intent || null,
          p_webhook_secret: process.env.STOREFRONT_WEBHOOK_SECRET
        });
      }
    } else if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object;
      await callRpc('cancel_subscription_record', {
        p_stripe_subscription_id: subscription.id,
        p_webhook_secret: process.env.STOREFRONT_WEBHOOK_SECRET
      });
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('stripe-webhook: failed to record payment', err.message);
    // Ask Stripe to retry — the row should never silently stay unpaid on our error.
    res.status(500).json({ error: 'Failed to record payment' });
  }
};
