// POST /api/create-checkout-session
// Body: { kind: 'order', site: 'clinipausemd' | 'drivanah', order: { items: [...] } }
//
// Creates a Stripe Checkout session for shop orders. Prices always come from
// the database, never from the client, so nobody can pay a different amount
// than what they are actually being charged. (Consultation booking was removed
// from the website; kind 'booking' now answers 410.)

const Stripe = require('stripe');
const { select } = require('./_supabase');

const ALLOWED_SITES = ['clinipausemd', 'drivanah'];

// Stripe's minimum is 30 minutes. The database holds an unpaid slot for 35,
// so a checkout can never be completed after its slot has been released.
const CHECKOUT_EXPIRY_SECONDS = 31 * 60;

// Only same-site, simple page paths are accepted as the return page.
function safeReturnPath(path) {
  return typeof path === 'string' && /^\/[a-z0-9-]*(\.html)?$/i.test(path) ? path : '/';
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    res.status(500).json({ error: 'Payments are not configured yet' });
    return;
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

  let body = req.body;
  if (!body || typeof body === 'string') {
    try { body = JSON.parse(body || '{}'); } catch (e) { body = {}; }
  }

  const { kind, site, origin } = body;

  if (!ALLOWED_SITES.includes(site)) {
    res.status(400).json({ error: 'Unknown site' });
    return;
  }

  const safeOrigin = typeof origin === 'string' && /^https:\/\/[a-z0-9.-]+\.(vercel\.app|clinipausemd\.com|drivanah\.com)$/i.test(origin)
    ? origin
    : 'https://www.clinipausemd.com';

  try {
    // Consultation booking has been removed from the website (the practice
    // can't staff every state's licensing), so no new bookings are accepted.
    // Existing bookings are still honoured by the webhook, reminders and
    // video-room code, which don't go through this endpoint.
    if (kind === 'booking') {
      res.status(410).json({ error: 'Consultation booking is no longer available on this website.' });
      return;
    }

    if (kind === 'order') {
      // One-click buy: no pre-checkout form on our site at all. We only need
      // to know which product(s) — Stripe's own hosted page collects the
      // customer's email, name, and shipping address. The order row itself
      // isn't created until the webhook confirms payment (create_paid_order),
      // using the details Stripe captured plus prices looked up here from
      // the database, never trusted from the client.
      const items = Array.isArray(body.order && body.order.items) ? body.order.items : [];
      if (!items.length) {
        res.status(400).json({ error: 'No items to purchase' });
        return;
      }
      if (items.length > 50) {
        res.status(400).json({ error: 'Too many items' });
        return;
      }

      const lineItems = [];
      const metaItems = [];
      let hasRecurring = false;

      for (const item of items) {
        const quantity = Math.max(Math.min(parseInt(item.quantity, 10) || 1, 999), 1);
        const productId = typeof item.product_id === 'string' ? item.product_id : '';
        if (!productId) {
          res.status(400).json({ error: 'Invalid item in cart' });
          return;
        }
        const recurring = item.recurring === true;
        if (recurring) hasRecurring = true;

        const rows = await select('store_products', `id=eq.${encodeURIComponent(productId)}&select=id,name,price_cents,image_url&active=eq.true`);
        const product = rows[0];
        if (!product) {
          res.status(400).json({ error: 'One of the selected products is unavailable' });
          return;
        }

        const priceData = {
          currency: 'usd',
          unit_amount: product.price_cents,
          product_data: {
            name: product.name,
            images: product.image_url ? [product.image_url] : undefined
          }
        };
        if (recurring) {
          priceData.recurring = { interval: 'month' };
        }

        lineItems.push({ price_data: priceData, quantity });
        metaItems.push({ product_id: product.id, quantity, recurring });
      }

      // Stripe Checkout requires a single mode per session. If any item is
      // recurring, the whole session runs in subscription mode — Stripe
      // allows mixing one-time (`price_data` without `recurring`) and
      // recurring line items within a single subscription-mode session.
      // Tag the resulting charges so revenue reporting can tell website
      // sales apart from app subscriptions in the same Stripe account.
      const sourceTag = { source: 'website', kind: 'order' };
      const session = await stripe.checkout.sessions.create({
        mode: hasRecurring ? 'subscription' : 'payment',
        ...(hasRecurring ? { subscription_data: { metadata: sourceTag } } : { payment_intent_data: { metadata: sourceTag } }),
        payment_method_types: ['card'],
        phone_number_collection: { enabled: true },
        shipping_address_collection: { allowed_countries: ['US', 'CA'] },
        line_items: lineItems,
        metadata: { kind: 'order', site, items: JSON.stringify(metaItems), recurring: hasRecurring ? '1' : '0' },
        success_url: `${safeOrigin || 'https://nopausemd.vercel.app'}/shop.html?paid=1`,
        cancel_url: `${safeOrigin || 'https://nopausemd.vercel.app'}/shop.html?canceled=1`
      });

      res.status(200).json({ url: session.url });
      return;
    }

    res.status(400).json({ error: 'Unknown kind' });
  } catch (err) {
    console.error('create-checkout-session error:', err.message);
    res.status(400).json({ error: err.message || 'Unable to start checkout' });
  }
};
