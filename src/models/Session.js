const mongoose = require('mongoose');

const { Schema } = mongoose;

/*
 * One document per browser session (a random id set in a first-party cookie
 * on first visit, alongside the consent notice). This is what ties page
 * views, behavioral events, and rrweb replay chunks together for a single
 * visit, and — only once a visitor identifies themselves via a form
 * submission — to a real Submission record.
 *
 * Deliberately does NOT attempt to fingerprint or de-anonymize visitors.
 * `submissionId`/`email` are only ever set from a submission the visitor
 * themselves made, never inferred from IP/UA/behavioral correlation.
 */
const SessionSchema = new Schema(
  {
    sessionId: { type: String, required: true, unique: true, index: true, maxlength: 100 },

    firstSeenAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now, index: true },

    landingPath: { type: String, maxlength: 300 },
    referrer: { type: String, maxlength: 500 },

    ip: { type: String, maxlength: 100 },
    userAgentRaw: { type: String, maxlength: 1000 },
    parsedUA: {
      browser: { type: String, maxlength: 200 },
      os: { type: String, maxlength: 200 },
      device: { type: String, maxlength: 200 },
    },
    viewport: {
      width: Number,
      height: Number,
    },

    consentGiven: { type: Boolean, default: false },
    replayEnabled: { type: Boolean, default: false },

    pageViewCount: { type: Number, default: 0 },
    eventCount: { type: Number, default: 0 },
    replayChunkCount: { type: Number, default: 0 },
    replayDurationMs: { type: Number, default: 0 },

    // Rolling behavioral counters, cheap to keep denormalized here so the
    // sessions list can render without aggregating raw events every time.
    rageClickCount: { type: Number, default: 0 },
    deadClickCount: { type: Number, default: 0 },
    maxScrollDepthPct: { type: Number, default: 0 },
    formFieldTouches: { type: Number, default: 0 },

    // Set only once the visitor identifies themselves (form submit).
    submissionId: { type: Schema.Types.ObjectId, ref: 'Submission', default: null, index: true },
    email: { type: String, maxlength: 320, default: null },

    // Optional, off-by-default LLM-generated behavioral summary. Never
    // contains identity guesses — see src/services/llmSummary.js.
    llmSummary: {
      text: { type: String, maxlength: 4000 },
      generatedAt: Date,
      model: { type: String, maxlength: 200 },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Session', SessionSchema);
