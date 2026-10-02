// MIRROR of api/_twilio.js at the repo root — keep the two identical.
// The website and the admin dashboard are separate Vercel projects built
// from this repo (root vs admin/ as Root Directory), so each needs its own
// copy of shared helpers. Admin-only endpoints live only here in admin/api;
// website endpoints live only in the root api/ (the Hobby plan allows at
// most 12 functions per project).

// Minimal Twilio Video client — REST calls for room lifecycle plus manual
// Access Token (JWT) signing. No `twilio` npm dependency: this API layer's
// convention (see _supabase.js) is plain `fetch` and Node's built-in `crypto`
// wherever that's enough, to keep each function's bundle small.
//
// This is the WEBSITE's own use of Twilio, entirely separate from the mobile
// app's video calling (which the app backend on Render manages with its own
// Twilio calls). They happen to share one Twilio account, nothing more.

const crypto = require('crypto');

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const API_KEY_SID = process.env.TWILIO_API_KEY_SID;
const API_KEY_SECRET = process.env.TWILIO_API_KEY_SECRET;
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;

function isConfigured() {
  return !!(ACCOUNT_SID && API_KEY_SID && API_KEY_SECRET);
}

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Builds a Twilio Video grant Access Token for one identity, scoped to one
// room, valid for `ttlSeconds` only. Signed HS256 with the API Key Secret —
// this is exactly what the `twilio` SDK's AccessToken/VideoGrant classes
// produce, just written out by hand.
function buildVideoAccessToken({ identity, roomName, ttlSeconds }) {
  if (!isConfigured()) throw new Error('Twilio is not configured');

  const now = Math.floor(Date.now() / 1000);
  const header = { typ: 'JWT', alg: 'HS256', cty: 'twilio-fpa;v=1' };
  const payload = {
    jti: `${API_KEY_SID}-${now}`,
    iss: API_KEY_SID,
    sub: ACCOUNT_SID,
    exp: now + (ttlSeconds || 3600),
    grants: {
      identity,
      video: { room: roomName }
    }
  };

  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = crypto.createHmac('sha256', API_KEY_SECRET).update(unsigned).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  return `${unsigned}.${signature}`;
}

async function twilioRequest(path, { method, form }) {
  if (!ACCOUNT_SID || !AUTH_TOKEN) throw new Error('Twilio is not configured');

  const res = await fetch(`https://video.twilio.com/v1/${path}`, {
    method: method || 'GET',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: form ? new URLSearchParams(form).toString() : undefined
  });

  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }

  if (!res.ok && res.status !== 404) {
    const message = (data && data.message) || `Twilio request to ${path} failed`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }

  return { ok: res.ok, status: res.status, data };
}

// Creates a Twilio Video "group" room if one with this unique name isn't
// already in progress (idempotent — safe to call on every join attempt).
// `endsAt` (a Date) becomes Twilio's MaxParticipantDuration, a hard cap
// Twilio enforces itself, so nobody stays connected past the booked time
// even if their browser ignores the on-screen countdown. Empty/unused
// rooms close themselves within minutes.
async function findOrCreateRoom(uniqueName, opts) {
  const existing = await twilioRequest(`Rooms/${encodeURIComponent(uniqueName)}`, { method: 'GET' });
  if (existing.ok && existing.data && existing.data.status === 'in-progress') {
    return existing.data;
  }

  const form = {
    UniqueName: uniqueName,
    Type: 'group',
    EmptyRoomTimeout: '5',
    UnusedRoomTimeout: '10'
  };
  if (opts && opts.endsAt) {
    const graceSeconds = 5 * 60;
    const seconds = Math.ceil((opts.endsAt.getTime() - Date.now()) / 1000) + graceSeconds;
    form.MaxParticipantDuration = String(Math.min(Math.max(seconds, 600), 86400));
  }

  const created = await twilioRequest('Rooms', { method: 'POST', form });
  return created.data;
}

// Ends a room immediately (used by the overdue-meeting sweep). Safe to call
// on a room that's already completed or never existed.
async function completeRoom(roomSidOrName) {
  if (!roomSidOrName) return;
  try {
    await twilioRequest(`Rooms/${encodeURIComponent(roomSidOrName)}`, {
      method: 'POST',
      form: { Status: 'completed' }
    });
  } catch (err) {
    if (err.status !== 404) throw err;
  }
}

module.exports = { isConfigured, buildVideoAccessToken, findOrCreateRoom, completeRoom };
