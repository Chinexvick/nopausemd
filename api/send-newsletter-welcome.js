// POST /api/send-newsletter-welcome
// Body: { email, site }
//
// Sends a one-time welcome email to a brand-new newsletter subscriber via
// Hostinger Business Mail (SMTP). Called by the client right after
// subscribe_newsletter returns "new" — never for an already-subscribed
// email, so this never double-sends the welcome note.
//
// Credentials live only in Vercel env vars (HOSTINGER_SMTP_USER/PASS) —
// never in this file or the repo.

const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const ALLOWED_SITES = ['clinipausemd', 'drivanah'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function buildHtml() {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Welcome to CliniPause</title>
</head>
<body style="margin:0; padding:0; background-color:#f5f6f7; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f6f7; padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px; background-color:#ffffff; border-radius:20px; overflow:hidden; box-shadow:0 4px 24px rgba(0,0,0,0.06);">

          <!-- Header -->
          <tr>
            <td style="background-color:#0c211b; padding:36px 40px; text-align:center;">
              <img src="cid:clinipause-logo" width="64" height="64" alt="CliniPause" style="display:block; margin:0 auto 12px; border-radius:14px; background:#ffffff; padding:6px;">
              <div style="color:#ffffff; font-family:Georgia,'Times New Roman',serif; font-size:24px; font-weight:600; letter-spacing:0.02em;">CliniPause</div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 8px;">
              <p style="margin:0 0 4px; font-size:13px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:#6cbf3d;">You're on the list</p>
              <h1 style="margin:0 0 18px; font-family:Georgia,'Times New Roman',serif; font-size:26px; line-height:1.3; color:#121212;">Welcome to CliniPause 🌿</h1>
              <p style="margin:0 0 16px; font-size:15px; line-height:1.7; color:#3a3f42;">Thank you for subscribing to the CliniPause newsletter. You'll now be the first to hear about new wellness products, menopause and hormone health guidance, and updates from our care team.</p>
              <p style="margin:0 0 28px; font-size:15px; line-height:1.7; color:#3a3f42;">In the meantime, feel free to explore our services or shop our natural wellness products designed to support you through every stage of your journey.</p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
                <tr>
                  <td style="border-radius:999px; background-color:#6cbf3d;">
                    <a href="https://www.clinipausemd.com/shop.html" style="display:inline-block; padding:14px 28px; font-size:15px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:999px;">Explore Wellness Products</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:8px 40px;">
              <hr style="border:none; border-top:1px solid #eef0f2; margin:24px 0;">
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:0 40px 36px;">
              <p style="margin:0 0 6px; font-size:13px; line-height:1.6; color:#8a9199;">CliniPause &middot; Clinical Care. Natural Solutions. A Healthier You.</p>
              <p style="margin:0; font-size:13px; line-height:1.6; color:#8a9199;">
                <a href="mailto:info@clinipausemd.com" style="color:#6cbf3d; text-decoration:none;">info@clinipausemd.com</a>
              </p>
            </td>
          </tr>
        </table>

        <p style="max-width:520px; margin:20px auto 0; font-size:12px; color:#a7aeb4; text-align:center; line-height:1.6;">
          You're receiving this email because you subscribed to updates at clinipausemd.com.<br>
          CliniPause provides education and personalized wellness guidance; it does not diagnose, prescribe, or replace care from a licensed clinician.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
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
    const transporter = nodemailer.createTransport({
      host: process.env.HOSTINGER_SMTP_HOST || 'smtp.hostinger.com',
      port: Number(process.env.HOSTINGER_SMTP_PORT || 465),
      secure: true, // SSL on port 465
      auth: {
        user: process.env.HOSTINGER_SMTP_USER,
        pass: process.env.HOSTINGER_SMTP_PASS
      }
    });

    const logoPath = path.join(process.cwd(), 'assets', 'images', 'logo-main-color.png');

    await transporter.sendMail({
      from: '"CliniPause" <' + process.env.HOSTINGER_SMTP_USER + '>',
      to: email,
      subject: 'Welcome to CliniPause 🌿',
      html: buildHtml(),
      text: 'Welcome to CliniPause! Thank you for subscribing to our newsletter. Explore our wellness products at https://www.clinipausemd.com/shop.html',
      attachments: fs.existsSync(logoPath) ? [{
        filename: 'clinipause-logo.png',
        path: logoPath,
        cid: 'clinipause-logo'
      }] : []
    });

    res.status(200).json({ sent: true });
  } catch (err) {
    console.error('send-newsletter-welcome: failed to send', err.message);
    // Don't fail the subscription flow over email delivery — the person is
    // still subscribed even if the welcome note couldn't be sent right now.
    res.status(200).json({ sent: false, error: err.message });
  }
};
