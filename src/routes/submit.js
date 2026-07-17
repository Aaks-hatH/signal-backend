const express = require('express');
const rateLimit = require('express-rate-limit');
const { UAParser } = require('ua-parser-js');

const Submission = require('../models/Submission');
const { validateSubmission } = require('../utils/validateSubmission');
const { generateReferenceCode } = require('../utils/referenceCode');

const router = express.Router();

const submitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 requests per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many submissions from this IP. Please try again later.' },
});

function getClientIp(req) {
  // req.ip already respects `app.set('trust proxy', ...)` if configured.
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

router.post('/submit', submitLimiter, async (req, res) => {
  try {
    const result = validateSubmission(req.body);
    if (!result.ok) {
      return res.status(400).json({ error: result.error });
    }

    const { clean, extraFields } = result;
    const ip = getClientIp(req);

    let parsedUA = { browser: '', os: '', device: '' };
    try {
      const parser = new UAParser(req.headers['user-agent'] || clean.userAgent || '');
      const ua = parser.getResult();
      parsedUA = {
        browser: [ua.browser.name, ua.browser.version].filter(Boolean).join(' ') || 'unknown',
        os: [ua.os.name, ua.os.version].filter(Boolean).join(' ') || 'unknown',
        device: ua.device.type || 'desktop',
      };
    } catch (e) {
      // If parsing fails for any reason, we still keep the raw UA string.
      parsedUA = { browser: 'unknown', os: 'unknown', device: 'unknown' };
    }

    // Reference code is always generated server-side, never trusted from the client.
    let referenceCode = generateReferenceCode();
    // Extremely unlikely collision given the keyspace, but guard against it anyway.
    for (let attempt = 0; attempt < 5; attempt++) {
      const exists = await Submission.exists({ referenceCode });
      if (!exists) break;
      referenceCode = generateReferenceCode();
    }

    const doc = new Submission({
      ...clean,
      clientSubmittedAt: clean.submittedAt,
      userAgentRaw: req.headers['user-agent'] || clean.userAgent || '',
      extraFields,
      ip,
      parsedUA,
      referenceCode,
      rawJson: req.body,
    });

    await doc.save();

    return res.status(201).json({ referenceCode });
  } catch (err) {
    console.error('[submit] error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;
