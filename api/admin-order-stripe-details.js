// GET /api/admin-order-stripe-details?payment_intent_id=pi_...
// Header: Authorization: Bearer <supabase access token>
//
// Admin-only. Verifies the caller is a signed-in Supabase user AND that
// user has a row in store_admins (via the is_store_admin() RPC, called
// with their own token so RLS/auth.uid() resolves to them) before ever
// touching Stripe. Only then does it use the server-only Stripe secret
// key to pull live payment details — card brand/last4, receipt link,
// charge status — that we don't store a full copy of in our own database.

const Stripe = require('stripe');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

async function isRequestFromAdmin(accessToken) {
  if (!accessToken) return false;

  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/is_store_admin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({})
  });

  if (!res.ok) return false;
  const data = await res.json().catch(() => false);
  return data === true;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!process.env.STRIPE_SECRET_KEY || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    res.status(500).json({ error: 'Not configured' });
    return;
  }

  const authHeader = req.headers.authorization || '';
  const accessToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  try {
    const isAdmin = await isRequestFromAdmin(accessToken);
    if (!isAdmin) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
  } catch (err) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  const paymentIntentId = req.query.payment_intent_id;
  if (!paymentIntentId || typeof paymentIntentId !== 'string' || !paymentIntentId.startsWith('pi_')) {
    res.status(400).json({ error: 'Invalid payment_intent_id' });
    return;
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ['latest_charge', 'latest_charge.payment_method_details']
    });

    const charge = intent.latest_charge && typeof intent.latest_charge === 'object' ? intent.latest_charge : null;
    const card = charge && charge.payment_method_details && charge.payment_method_details.card;

    res.status(200).json({
      id: intent.id,
      status: intent.status,
      amount: intent.amount,
      currency: intent.currency,
      created: intent.created,
      card: card ? { brand: card.brand, last4: card.last4, exp_month: card.exp_month, exp_year: card.exp_year } : null,
      receipt_url: charge ? charge.receipt_url : null,
      charge_status: charge ? charge.status : null,
      refunded: charge ? charge.refunded : false,
      amount_refunded: charge ? charge.amount_refunded : 0,
      dashboard_url: `https://dashboard.stripe.com/payments/${intent.id}`
    });
  } catch (err) {
    console.error('admin-order-stripe-details: failed', err.message);
    res.status(404).json({ error: 'Payment not found in Stripe' });
  }
};
