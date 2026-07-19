const express = require('express');
const rateLimit = require('express-rate-limit');
const { UAParser } = require('ua-parser-js');

const PageView = require('../models/PageView');
const Session = require('../models/Session');
const { getOrCreateSessionId } = require('../utils/sessionId');

const router = express.Router();

// Page views are far more frequent than actual form submissions, so this
// gets a much looser cap than the /submit limiter.
const trackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
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

function parseUA(uaRaw) {
  try {
    const parser = new UAParser(uaRaw);
    const ua = parser.getResult();
    return {
      browser: [ua.browser.name, ua.browser.version].filter(Boolean).join(' ') || 'unknown',
      os: [ua.os.name, ua.os.version].filter(Boolean).join(' ') || 'unknown',
      device: ua.device.type || 'desktop',
    };
  } catch (e) {
    return { browser: 'unknown', os: 'unknown', device: 'desktop' };
  }
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
    const parsedUA = parseUA(uaRaw);
    const consent = body.consent === true;
    const viewport =
      body.viewport && typeof body.viewport.w === 'number' && typeof body.viewport.h === 'number'
        ? { width: Math.round(body.viewport.w), height: Math.round(body.viewport.h) }
        : undefined;

    const { sessionId, isNew } = getOrCreateSessionId(req, res);

    await PageView.create({
      sessionId,
      path,
      referrer,
      event,
      ip,
      userAgentRaw: uaRaw.slice(0, 1000),
      parsedUA,
    });

    const update = {
      $set: {
        lastSeenAt: new Date(),
        ip,
        userAgentRaw: uaRaw.slice(0, 1000),
        parsedUA,
        consentGiven: consent,
      },
      $inc: { pageViewCount: 1 },
    };
    if (viewport) update.$set.viewport = viewport;
    if (isNew) {
      update.$setOnInsert = {
        sessionId,
        firstSeenAt: new Date(),
        landingPath: path,
        referrer,
      };
    }

    await Session.findOneAndUpdate({ sessionId }, update, { upsert: true, new: true });

    console.log(
      `[pageview] event=${event} sid=${sessionId.slice(0, 8)} ip=${ip} path=${path} browser="${parsedUA.browser}" os="${parsedUA.os}" referrer="${referrer || 'direct'}"`
    );

    res.status(204).end();
  } catch (err) {
    console.error('[track] error:', err);
    res.status(500).json({ error: 'Failed to record page view.' });
  }
});

module.exports = router;
