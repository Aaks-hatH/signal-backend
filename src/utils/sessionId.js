const crypto = require('crypto');

const COOKIE_NAME = 'signal_sid';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/*
 * A random, first-party, purely-for-grouping-analytics id. Deliberately NOT
 * a fingerprint of any kind — it's just enough to know "these ten page
 * views/events/replay chunks came from the same browser visit." If cookies
 * are cleared or blocked, a new id is issued and that's fine; we're not
 * trying to re-identify the same human across that boundary.
 */
function getOrCreateSessionId(req, res) {
  const existing = req.cookies && req.cookies[COOKIE_NAME];
  if (existing && /^[a-f0-9]{32}$/.test(existing)) {
    return { sessionId: existing, isNew: false };
  }

  const isProd = process.env.NODE_ENV === 'production';
  const sessionId = crypto.randomBytes(16).toString('hex');
  res.cookie(COOKIE_NAME, sessionId, {
    maxAge: MAX_AGE_MS,
    httpOnly: true,
    // Cross-origin (frontend on one domain, this API on another) requires
    // SameSite=None + Secure for the browser to send the cookie at all.
    sameSite: isProd ? 'none' : 'lax',
    secure: isProd,
  });
  return { sessionId, isNew: true };
}

module.exports = { getOrCreateSessionId, COOKIE_NAME };
