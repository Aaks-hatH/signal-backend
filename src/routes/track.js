const express = require('express');
const rateLimit = require('express-rate-limit');
const { UAParser } = require('ua-parser-js');

const PageView = require('../models/PageView');

const router = express.Router();

// Page views are far more frequent than actual form submissions, so this
// gets a much looser cap than the /submit limiter.
const trackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP. Please try again later.' },
});

function getClientIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function clampString(v, max) {
  if (typeof v !== 'string') return '';
  return v.slice(0, max);
}

const ALLOWED_EVENTS = new Set(['pageview', 'wizard_start', 'wizard_submit']);

router.post('/track', trackLimiter, async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const ip = getClientIp(req);
    const path = clampString(body.path, 300) || '/';
    const referrer = clampString(body.referrer, 500);
    const event = ALLOWED_EVENTS.has(body.event) ? body.event : 'pageview';
    const uaRaw = req.headers['user-agent'] || '';

    let parsedUA = { browser: 'unknown', os: 'unknown', device: 'desktop' };
    try {
      const parser = new UAParser(uaRaw);
      const ua = parser.getResult();
      parsedUA = {
        browser: [ua.browser.name, ua.browser.version].filter(Boolean).join(' ') || 'unknown',
        os: [ua.os.name, ua.os.version].filter(Boolean).join(' ') || 'unknown',
        device: ua.device.type || 'desktop',
      };
    } catch (e) {
      // Keep the fallback parsedUA above if parsing fails for any reason.
    }

    await PageView.create({
      path,
      referrer,
      event,
      ip,
      userAgentRaw: uaRaw.slice(0, 1000),
      parsedUA,
    });

    // Structured, single-line log so it's easy to scan or grep for in
    // Render's log viewer (Logs tab -> filter on "[pageview]").
    console.log(
      `[pageview] event=${event} ip=${ip} path=${path} browser="${parsedUA.browser}" os="${parsedUA.os}" referrer="${referrer || 'direct'}"`
    );

    res.status(204).end();
  } catch (err) {
    console.error('[track] error:', err);
    res.status(500).json({ error: 'Failed to record page view.' });
  }
});

module.exports = router;
