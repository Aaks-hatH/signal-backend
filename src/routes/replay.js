const express = require('express');
const rateLimit = require('express-rate-limit');

const ReplayChunk = require('../models/ReplayChunk');
const Session = require('../models/Session');
const { getOrCreateSessionId } = require('../utils/sessionId');

const router = express.Router();

const replayLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 400,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP. Please try again later.' },
});

function clampString(v, max) {
  if (typeof v !== 'string') return '';
  return v.slice(0, max);
}

// A single batch of rrweb events, JSON-encoded, capped well below Mongo's
// 16MB document limit — rrweb batches in the browser are flushed every few
// seconds / every N events, so this should never realistically be hit.
const MAX_BATCH_BYTES = 3 * 1024 * 1024;

router.post('/replay', replayLimiter, async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const events = Array.isArray(body.events) ? body.events : null;
    const seq = Number.isInteger(body.seq) ? body.seq : null;

    if (!events || events.length === 0 || seq === null) {
      return res.status(400).json({ error: 'events[] and integer seq are required.' });
    }

    const size = Buffer.byteLength(JSON.stringify(events));
    if (size > MAX_BATCH_BYTES) {
      return res.status(413).json({ error: 'Replay batch too large.' });
    }

    // Replay is opt-in per session (consent notice must be accepted) —
    // enforced server-side too, not just by whether the client bothered
    // to start rrweb.record().
    const { sessionId } = getOrCreateSessionId(req, res);
    const session = await Session.findOne({ sessionId }).lean();
    if (!session || !session.consentGiven) {
      return res.status(403).json({ error: 'Replay requires consent for this session.' });
    }

    const path = clampString(body.path, 300);
    const timestamps = events.map((e) => e && e.timestamp).filter((t) => typeof t === 'number');
    const startedAt = timestamps.length ? Math.min(...timestamps) : undefined;
    const endedAt = timestamps.length ? Math.max(...timestamps) : undefined;

    await ReplayChunk.findOneAndUpdate(
      { sessionId, seq },
      { sessionId, seq, path, events, startedAt, endedAt },
      { upsert: true }
    );

    const durationDelta = startedAt && endedAt ? endedAt - startedAt : 0;
    await Session.findOneAndUpdate(
      { sessionId },
      {
        $set: { lastSeenAt: new Date(), replayEnabled: true },
        $inc: { replayChunkCount: 1, replayDurationMs: durationDelta },
      }
    );

    res.status(204).end();
  } catch (err) {
    console.error('[replay] error:', err);
    res.status(500).json({ error: 'Failed to record replay chunk.' });
  }
});

module.exports = router;
