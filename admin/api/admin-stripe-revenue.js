// GET /api/admin-stripe-revenue
// Header: Authorization: Bearer <supabase access token>
//
// Super-admin only. Verifies the caller is a signed-in Supabase user AND
// that user has a row in super_admins (via the is_super_admin() RPC,
// called with their own token so auth.uid() resolves to them) before
// touching Stripe. Computes gross/net USD revenue totals for four
// buckets (today, this week, this month, this year) plus a day-by-day
// breakdown for the current month, by listing stripe.charges.list and
// summing paid, non-fully-refunded charges (net subtracts any partial
// refund via amount_refunded). This account has no test mode and, as of
// this writing, zero real charges — every bucket must resolve to 0
// cleanly rather than erroring.

const Stripe = require('stripe');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

async function isRequestFromSuperAdmin(accessToken) {
  if (!accessToken) return false;

  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/is_super_admin`, {
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

function startOfUTCDay(d) {
  return Math.floor(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).getTime() / 1000);
}

// Sums charges in [gteSec, lteSec) into { gross_cents, net_cents, count, skipped_other_currency }.
// Also — when dayBuckets is passed — accumulates each usd charge's net amount into the
// day bucket (keyed by UTC date string) it falls in, for the current-month chart.
async function sumCharges(stripe, gteSec, lteSec, dayBuckets) {
  let gross = 0;
  let net = 0;
  let count = 0;
  let skippedOtherCurrency = 0;

  const params = {
    created: { gte: gteSec, lt: lteSec },
    limit: 100
  };

  const list = stripe.charges.list(params);
  if (typeof list.autoPagingEach === 'function') {
    for await (const charge of list.autoPagingEach()) {
      accumulate(charge);
    }
  } else {
    // Manual pagination fallback for older SDKs without autoPagingEach.
    let startingAfter;
    for (;;) {
      const page = await stripe.charges.list(Object.assign({}, params, startingAfter ? { starting_after: startingAfter } : {}));
      for (const charge of page.data) accumulate(charge);
      if (!page.has_more || page.data.length === 0) break;
      startingAfter = page.data[page.data.length - 1].id;
    }
  }

  return { gross_cents: gross, net_cents: net, count, skipped_other_currency: skippedOtherCurrency };

  function accumulate(charge) {
    if (charge.currency !== 'usd') { skippedOtherCurrency += 1; return; }
    if (!charge.paid || charge.refunded) return;

    const grossAmount = charge.amount || 0;
    const netAmount = grossAmount - (charge.amount_refunded || 0);

    gross += grossAmount;
    net += netAmount;
    count += 1;

    if (dayBuckets) {
      var dateKey = new Date(charge.created * 1000).toISOString().slice(0, 10);
      if (dayBuckets[dateKey] === undefined) dayBuckets[dateKey] = 0;
      dayBuckets[dateKey] += netAmount;
    }
  }
}

// Exported for local/offline testing of the aggregation math with mocked
// charge data, without needing a live Stripe client.
function aggregateCharges(charges) {
  const dayBuckets = {};
  let gross = 0, net = 0, count = 0, skippedOtherCurrency = 0;

  charges.forEach(function (charge) {
    if (charge.currency !== 'usd') { skippedOtherCurrency += 1; return; }
    if (!charge.paid || charge.refunded) return;

    const grossAmount = charge.amount || 0;
    const netAmount = grossAmount - (charge.amount_refunded || 0);

    gross += grossAmount;
    net += netAmount;
    count += 1;

    var dateKey = new Date(charge.created * 1000).toISOString().slice(0, 10);
    if (dayBuckets[dateKey] === undefined) dayBuckets[dateKey] = 0;
    dayBuckets[dateKey] += netAmount;
  });

  return { gross_cents: gross, net_cents: net, count, skipped_other_currency: skippedOtherCurrency, dayBuckets };
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
    const isSuperAdmin = await isRequestFromSuperAdmin(accessToken);
    if (!isSuperAdmin) {
      res.status(403).json({ error: 'Super admin access required' });
      return;
    }
  } catch (err) {
    res.status(403).json({ error: 'Super admin access required' });
    return;
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

    const now = new Date();
    const todayStartSec = startOfUTCDay(now);
    const weekStartSec = todayStartSec - 6 * 24 * 60 * 60; // last 7 days inclusive of today
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const monthStartSec = Math.floor(monthStart.getTime() / 1000);
    const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const yearStartSec = Math.floor(yearStart.getTime() / 1000);
    const nowSec = Math.floor(now.getTime() / 1000) + 1;

    const dayBuckets = {};

    // The month bucket walk also populates dayBuckets for the chart; the
    // other three buckets don't need per-day detail.
    const [today, week, month, year] = await Promise.all([
      sumCharges(stripe, todayStartSec, nowSec),
      sumCharges(stripe, weekStartSec, nowSec),
      sumCharges(stripe, monthStartSec, nowSec, dayBuckets),
      sumCharges(stripe, yearStartSec, nowSec)
    ]);

    const daysInMonthSoFar = now.getUTCDate();
    const daily = [];
    for (let day = 1; day <= daysInMonthSoFar; day++) {
      const dateKey = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day)).toISOString().slice(0, 10);
      daily.push({ date: dateKey, amount_cents: dayBuckets[dateKey] || 0 });
    }

    res.status(200).json({
      currency: 'usd',
      today,
      week,
      month,
      year,
      daily
    });
  } catch (err) {
    console.error('admin-stripe-revenue: failed', err.message);
    res.status(500).json({ error: 'Failed to load revenue from Stripe' });
  }
};

module.exports.aggregateCharges = aggregateCharges;
