// POST /api/create-checkout-session
// Body: { kind: 'booking' | 'order', site: 'clinipausemd' | 'drivanah', ...fields }
//
// This is the only place a booking/order row gets created, and the only
// place that talks to Stripe. Amounts always come from the database
// (fixed $300 consultation fee, or product prices looked up server-side
// inside create_store_order) — never from the client — so nobody can pay
// a different amount than what they're actually being charged.

const Stripe = require('stripe');
const { callRpc, select } = require('./_supabase');

const ALLOWED_SITES = ['clinipausemd', 'drivanah'];
const CONSULT_FEE_CENTS = 30000;

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
    : null;

  try {
    if (kind === 'booking') {
      const b = body.booking || {};
      const bookingId = await callRpc('create_store_booking', {
        p_site: site,
        p_full_name: b.fullName,
        p_email: b.email,
        p_phone: b.phone,
        p_reason: b.reason || null,
        p_appointment_date: b.date,
        p_appointment_time: b.time
      });

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        customer_email: b.email,
        line_items: [{
          price_data: {
            currency: 'usd',
            unit_amount: CONSULT_FEE_CENTS,
            product_data: { name: 'CliniPause Consultation', description: `${b.date} at ${b.time}` }
          },
          quantity: 1
        }],
        metadata: { kind: 'booking', record_id: bookingId, site },
        success_url: `${safeOrigin || 'https://nopausemd.vercel.app'}/book.html?paid=1&booking=${bookingId}`,
        cancel_url: `${safeOrigin || 'https://nopausemd.vercel.app'}/book.html?canceled=1`
      });

      res.status(200).json({ url: session.url });
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

      const lineItems = [];
      const metaItems = [];

      for (const item of items) {
        const quantity = Math.max(parseInt(item.quantity, 10) || 1, 1);
        const rows = await select('store_products', `id=eq.${encodeURIComponent(item.product_id)}&select=id,name,price_cents,image_url&active=eq.true`);
        const product = rows[0];
        if (!product) {
          res.status(400).json({ error: 'One of the selected products is unavailable' });
          return;
        }

        lineItems.push({
          price_data: {
            currency: 'usd',
            unit_amount: product.price_cents,
            product_data: {
              name: product.name,
              images: product.image_url ? [product.image_url] : undefined
            }
          },
          quantity
        });
        metaItems.push({ product_id: product.id, quantity });
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        phone_number_collection: { enabled: true },
        shipping_address_collection: { allowed_countries: ['US', 'CA'] },
        line_items: lineItems,
        metadata: { kind: 'order', site, items: JSON.stringify(metaItems) },
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
