// Shared branded HTML email helper — used by every transactional email this
// API layer sends (newsletter welcome, admin order/booking notifications,
// and future ones). Keeps one visual design (dark green header with the
// CliniPause logo, card layout, footer) and one SMTP transport in one place.
//
// Credentials live only in Vercel env vars (HOSTINGER_SMTP_USER/PASS) —
// never in this file or the repo.

const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// Builds the branded card email body. Callers supply the copy; the chrome
// (header, card, footer, disclaimer) stays identical across every email.
function buildBrandedEmailHtml({ eyebrow, heading, bodyHtml, ctaLabel, ctaUrl }) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${heading}</title>
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
              <p style="margin:0 0 4px; font-size:13px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:#6cbf3d;">${eyebrow}</p>
              <h1 style="margin:0 0 18px; font-family:Georgia,'Times New Roman',serif; font-size:26px; line-height:1.3; color:#121212;">${heading}</h1>
              ${bodyHtml}
              ${ctaLabel && ctaUrl ? `
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 8px;">
                <tr>
                  <td style="border-radius:999px; background-color:#6cbf3d;">
                    <a href="${ctaUrl}" style="display:inline-block; padding:14px 28px; font-size:15px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:999px;">${ctaLabel}</a>
                  </td>
                </tr>
              </table>` : ''}
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

function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.HOSTINGER_SMTP_HOST || 'smtp.hostinger.com',
    port: Number(process.env.HOSTINGER_SMTP_PORT || 465),
    secure: true, // SSL on port 465
    auth: {
      user: process.env.HOSTINGER_SMTP_USER,
      pass: process.env.HOSTINGER_SMTP_PASS
    }
  });
}

// Sends one branded email. `to` may be a single address or an array of
// addresses (nodemailer accepts either as a comma-joined string).
async function sendBrandedEmail({ to, subject, html, text }) {
  if (!process.env.HOSTINGER_SMTP_USER || !process.env.HOSTINGER_SMTP_PASS) {
    throw new Error('Email is not configured (missing HOSTINGER_SMTP_USER/PASS)');
  }

  const transporter = createTransporter();
  const logoPath = path.join(process.cwd(), 'assets', 'images', 'logo-main-color.png');
  const toAddress = Array.isArray(to) ? to.join(',') : to;

  return transporter.sendMail({
    from: '"CliniPause" <' + process.env.HOSTINGER_SMTP_USER + '>',
    to: toAddress,
    subject,
    html,
    text,
    attachments: fs.existsSync(logoPath) ? [{
      filename: 'clinipause-logo.png',
      path: logoPath,
      cid: 'clinipause-logo'
    }] : []
  });
}

module.exports = { buildBrandedEmailHtml, sendBrandedEmail };
