const mongoose = require('mongoose');

const { Schema } = mongoose;

/*
 * We keep the fields we actually filter/sort/chart on as real, typed schema
 * fields. Anything else the form sends (including category-specific fields
 * that vary per category, and any future fields added to the survey) is
 * preserved untouched in `rawJson`, and any *unrecognized* top-level keys
 * are additionally captured in `extraFields` so they're easy to query/report
 * on without needing to reach into rawJson.
 */
const SubmissionSchema = new Schema(
  {
    referenceCode: { type: String, required: true, unique: true, index: true },

    // --- Identity / contact ---
    name: { type: String, maxlength: 200 },
    email: { type: String, maxlength: 320 },
    ageGroup: { type: String, maxlength: 50 },
    role: { type: String, maxlength: 200 },

    // --- Core problem signal ---
    category: { type: String, maxlength: 100, index: true },
    problemDescription: { type: String, maxlength: 5000 },
    severity: { type: String, maxlength: 50, index: true },
    timeCost: { type: String, maxlength: 100 },
    frequency: { type: String, maxlength: 50, index: true },
    currentSolution: { type: String, maxlength: 2000 },
    rating: { type: Number, min: 0, max: 10 },
    triedAlternatives: { type: String, maxlength: 2000 },
    whyStopped: { type: String, maxlength: 2000 },
    frustrationTags: { type: [String], default: [] },
    frustrationText: { type: String, maxlength: 3000 },

    // --- Solution / ideal state ---
    idealDescription: { type: String, maxlength: 5000 },
    mustHave: { type: String, maxlength: 2000 },
    platformPref: { type: String, maxlength: 200 },
    featurePriorities: { type: [String], default: [] },

    // --- Buying signal ---
    wouldUse: { type: String, maxlength: 50, index: true },
    wouldPay: { type: String, maxlength: 50, index: true },
    priceRange: { type: String, maxlength: 100, index: true },
    urgency: { type: String, maxlength: 50 },

    // --- Consent / follow-up ---
    consent: { type: Boolean, default: false },
    openToContact: { type: Boolean, default: false },
    contactMethod: { type: String, maxlength: 100 },
    contactValue: { type: String, maxlength: 320 },
    bestTime: { type: String, maxlength: 200 },
    betaInterest: { type: Boolean, default: false },

    // Anything category-specific or otherwise not modeled above but present
    // as a distinct top-level key in the payload.
    extraFields: { type: Schema.Types.Mixed, default: {} },

    // Client-reported metadata
    clientSubmittedAt: { type: String, maxlength: 100 },
    userAgentRaw: { type: String, maxlength: 1000 },

    // Server-captured metadata
    ip: { type: String, maxlength: 100 },
    parsedUA: {
      browser: { type: String, maxlength: 200 },
      os: { type: String, maxlength: 200 },
      device: { type: String, maxlength: 200 },
    },
    serverReceivedAt: { type: Date, default: Date.now, index: true },

    // The full, untouched payload exactly as received, so nothing is ever
    // lost even if the form changes shape in the future.
    rawJson: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true }
);

// Free-text search across the two long-form fields.
SubmissionSchema.index({ problemDescription: 'text', idealDescription: 'text' });

module.exports = mongoose.model('Submission', SubmissionSchema);
