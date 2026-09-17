// POST /api/create-checkout-session
// Body: { kind: 'booking' | 'order', site: 'clinipausemd' | 'drivanah', ...fields }
//
// This is the only place a booking/order row gets created, and the only
// place that talks to Stripe. Amounts always come from the database
// (fixed $300 consultation fee, or product prices looked up server-side
// inside create_store_order) — never from the client — so nobody can pay
// a different amount than what they're actually being charged.

const Stripe = require('stripe');
const { callRpc } = require('./_supabase');

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
      const o = body.order || {};
      const result = await callRpc('create_store_order', {
        p_site: site,
        p_customer_name: o.customerName,
        p_email: o.email,
        p_phone: o.phone || null,
        p_shipping_address: o.shippingAddress || null,
        p_items: o.items || []
      });

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        customer_email: o.email,
        shipping_address_collection: { allowed_countries: ['US', 'CA'] },
        line_items: [{
          price_data: {
            currency: 'usd',
            unit_amount: result.amount_cents,
            product_data: { name: 'CliniPause Order' }
          },
          quantity: 1
        }],
        metadata: { kind: 'order', record_id: result.id, site },
        success_url: `${safeOrigin || 'https://nopausemd.vercel.app'}/shop.html?paid=1&order=${result.id}`,
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
