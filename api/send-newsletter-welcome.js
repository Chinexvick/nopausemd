// POST /api/send-newsletter-welcome
// Body: { email, site }
//
// Sends a one-time welcome email to a brand-new newsletter subscriber via
// Hostinger Business Mail (SMTP). Called by the client right after
// subscribe_newsletter returns "new" — never for an already-subscribed
// email, so this never double-sends the welcome note.
//
// Credentials live only in Vercel env vars (HOSTINGER_SMTP_USER/PASS) —
// never in this file or the repo. Uses the shared branded email helper in
// ./_email.js so this and the admin notification email share one look.

const { buildBrandedEmailHtml, sendBrandedEmail } = require('./_email');

const ALLOWED_SITES = ['clinipausemd', 'drivanah'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function buildHtml() {
  return buildBrandedEmailHtml({
    eyebrow: "You're on the list",
    heading: 'Welcome to CliniPause 🌿',
    bodyHtml: `
      <p style="margin:0 0 16px; font-size:15px; line-height:1.7; color:#3a3f42;">Thank you for subscribing to the CliniPause newsletter. You'll now be the first to hear about new wellness products, menopause and hormone health guidance, and updates from our care team.</p>
      <p style="margin:0 0 28px; font-size:15px; line-height:1.7; color:#3a3f42;">In the meantime, feel free to explore our services or shop our natural wellness products designed to support you through every stage of your journey.</p>`,
    ctaLabel: 'Explore Wellness Products',
    ctaUrl: 'https://www.clinipausemd.com/shop.html'
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!process.env.HOSTINGER_SMTP_USER || !process.env.HOSTINGER_SMTP_PASS) {
    console.error('send-newsletter-welcome: missing SMTP credentials');
    res.status(500).json({ error: 'Email is not configured yet' });
    return;
  }

  let body = req.body;
  if (!body || typeof body === 'string') {
    try { body = JSON.parse(body || '{}'); } catch (e) { body = {}; }
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const site = body.site;

  if (!ALLOWED_SITES.includes(site)) {
    res.status(400).json({ error: 'Unknown site' });
    return;
  }
  if (!EMAIL_RE.test(email) || email.length > 320) {
    res.status(400).json({ error: 'Invalid email address' });
    return;
  }

  try {
    await sendBrandedEmail({
      to: email,
      subject: 'Welcome to CliniPause 🌿',
      html: buildHtml(),
      text: 'Welcome to CliniPause! Thank you for subscribing to our newsletter. Explore our wellness products at https://www.clinipausemd.com/shop.html'
    });

    res.status(200).json({ sent: true });
  } catch (err) {
    console.error('send-newsletter-welcome: failed to send', err.message);
    // Don't fail the subscription flow over email delivery — the person is
    // still subscribed even if the welcome note couldn't be sent right now.
    res.status(200).json({ sent: false, error: err.message });
  }
};
