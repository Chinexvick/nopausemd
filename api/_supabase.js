// Thin PostgREST/RPC helper. No supabase-js dependency needed — every call
// this API layer makes is a single RPC invocation, so plain fetch keeps the
// function bundle small. The anon key is safe to use here: every RPC it
// calls is either public-by-design (create_store_booking, create_store_order)
// or gated by its own server-only secret (confirm_store_payment).

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

async function callRpc(fnName, args) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase environment variables are not configured');
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`
    },
    body: JSON.stringify(args)
  });

  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }

  if (!res.ok) {
    const message = (data && (data.message || data.error_description || data.hint)) || `Supabase RPC ${fnName} failed`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }

  return data;
}

module.exports = { callRpc };
