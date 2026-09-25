// POST /api/notify-sensitive-action
// Header: Authorization: Bearer <supabase access token>
// Body: { action, target, actor_email }
//
// Admin-only (any store_admins row, not just super admins — the RLS/RPC
// layer already gates who can perform the underlying sensitive change;
// this endpoint just emails the internal notification list about it).
// Best-effort: always responds 200 (or the specific auth-failure code),
// never throws past its top-level catch, and email failures are logged
// but never turn into an error response — this is a nice-to-have, not
// critical path.

const { buildBrandedEmailHtml, sendBrandedEmail } = require('./_email');

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

// get_active_notification_recipients() is gated by the storefront webhook
// secret (checked inside the function against vault), not by admin/RLS —
// so even this admin-authenticated endpoint needs that server-only env var
// to call it. That's fine: it never leaves the server.
async function getActiveRecipients() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_active_notification_recipients`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`
    },
    body: JSON.stringify({ p_webhook_secret: process.env.STOREFRONT_WEBHOOK_SECRET })
  });

  if (!res.ok) return [];
  const data = await res.json().catch(() => []);
  return Array.isArray(data) ? data : [];
}

function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
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

  // From here on, never fail the request over an email problem.
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const action = String(body.action || 'Unknown action').slice(0, 200);
    const target = String(body.target || '—').slice(0, 200);
    const actorEmail = String(body.actor_email || 'An admin').slice(0, 200);

    const recipients = await getActiveRecipients().catch(() => []);
    if (!recipients.length) {
      res.status(200).json({ ok: true, sent: 0 });
      return;
    }

    const html = buildBrandedEmailHtml({
      eyebrow: 'ADMIN ACTIVITY',
      heading: 'Sensitive change made',
      bodyHtml:
        '<p style="margin:0 0 10px;font-size:15px;line-height:1.6;color:#3a3f42;"><strong>' + escapeHtml(actorEmail) + '</strong> performed a sensitive admin action.</p>' +
        '<p style="margin:0 0 4px;font-size:14px;color:#6b7176;"><strong>Action:</strong> ' + escapeHtml(action) + '</p>' +
        '<p style="margin:0;font-size:14px;color:#6b7176;"><strong>Target:</strong> ' + escapeHtml(target) + '</p>'
    });

    const results = await Promise.allSettled(
      recipients.map(function (email) {
        return sendBrandedEmail({
          to: email,
          subject: 'CliniPauseMD Admin — Sensitive change made',
          html,
          text: actorEmail + ' performed "' + action + '" on "' + target + '"'
        });
      })
    );

    const sent = results.filter(function (r) { return r.status === 'fulfilled'; }).length;
    results.forEach(function (r) {
      if (r.status === 'rejected') console.error('notify-sensitive-action: send failed', r.reason && r.reason.message);
    });

    res.status(200).json({ ok: true, sent, total: recipients.length });
  } catch (err) {
    console.error('notify-sensitive-action: unexpected failure', err && err.message);
    res.status(200).json({ ok: false });
  }
};
