const express = require('express');
const rateLimit = require('express-rate-limit');

const Event = require('../models/Event');
const Session = require('../models/Session');
const { getOrCreateSessionId } = require('../utils/sessionId');

const router = express.Router();

// Behavioral events are batched client-side, but a chatty tab can still
// send a lot of these — cap generously, well above normal usage.
const eventLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP. Please try again later.' },
});

function clampString(v, max) {
  if (typeof v !== 'string') return '';
  return v.slice(0, max);
}

// Keep `detail` small and shallow — this is behavioral metadata (selector,
// coordinates, scroll %, field name, timing), never free-typed field values.
function sanitizeDetail(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  let bytes = 0;
  for (const [k, v] of Object.entries(raw)) {
    if (bytes > 2000) break;
    if (typeof k !== 'string' || k.length > 60) continue;
    if (typeof v === 'string') {
      const s = v.slice(0, 200);
      out[k] = s;
      bytes += s.length;
    } else if (typeof v === 'number' && Number.isFinite(v)) {
      out[k] = v;
      bytes += 8;
    } else if (typeof v === 'boolean') {
      out[k] = v;
    }
  }
  return out;
}

const BEHAVIOR_COUNTER_FIELD = {
  rage_click: 'rageClickCount',
  dead_click: 'deadClickCount',
};

router.post('/event', eventLimiter, async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const items = Array.isArray(body.events) ? body.events.slice(0, 100) : [];
    if (items.length === 0) return res.status(204).end();

    const { sessionId } = getOrCreateSessionId(req, res);
    const path = clampString(body.path, 300);

    const docs = [];
    let maxScrollPct = 0;
    let rageClicks = 0;
    let deadClicks = 0;
    let fieldTouches = 0;

    for (const raw of items) {
      if (!raw || !Event.ALLOWED_TYPES.includes(raw.type)) continue;
      const detail = sanitizeDetail(raw.detail);

      docs.push({
        sessionId,
        type: raw.type,
        path,
        detail,
        clientTimestamp: typeof raw.t === 'number' ? raw.t : undefined,
      });

      if (raw.type === 'scroll_depth' && typeof detail.pct === 'number') {
        maxScrollPct = Math.max(maxScrollPct, Math.min(100, detail.pct));
      }
      if (raw.type === 'rage_click') rageClicks += 1;
      if (raw.type === 'dead_click') deadClicks += 1;
      if (raw.type === 'field_focus' || raw.type === 'field_hesitation') fieldTouches += 1;
    }

    if (docs.length === 0) return res.status(204).end();

    await Event.insertMany(docs, { ordered: false });

    const inc = { eventCount: docs.length };
    if (rageClicks) inc.rageClickCount = rageClicks;
    if (deadClicks) inc.deadClickCount = deadClicks;
    if (fieldTouches) inc.formFieldTouches = fieldTouches;

    const update = { $set: { lastSeenAt: new Date() }, $inc: inc };
    if (maxScrollPct > 0) {
      update.$max = { maxScrollDepthPct: maxScrollPct };
    }

    await Session.findOneAndUpdate({ sessionId }, update);

    res.status(204).end();
  } catch (err) {
    console.error('[events] error:', err);
    res.status(500).json({ error: 'Failed to record events.' });
  }
});

module.exports = router;
