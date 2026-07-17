// Fields the survey is expected to send, and how to handle each one.
// Anything not listed here is treated as "extra" — allowed, but capped in
// count/size and stashed in extraFields rather than silently dropped.

const KNOWN_STRING_FIELDS = {
  name: 200,
  email: 320,
  ageGroup: 50,
  role: 200,
  category: 100,
  problemDescription: 5000,
  severity: 50,
  timeCost: 100,
  frequency: 50,
  currentSolution: 2000,
  triedAlternatives: 2000,
  whyStopped: 2000,
  frustrationText: 3000,
  idealDescription: 5000,
  mustHave: 2000,
  platformPref: 200,
  wouldUse: 50,
  wouldPay: 50,
  priceRange: 100,
  urgency: 50,
  contactMethod: 100,
  contactValue: 320,
  bestTime: 200,
  submittedAt: 100, // client's own timestamp string
  userAgent: 1000,
};

const KNOWN_ARRAY_FIELDS = ['frustrationTags', 'featurePriorities'];
const KNOWN_BOOLEAN_FIELDS = ['consent', 'openToContact', 'betaInterest'];
const KNOWN_NUMBER_FIELDS = ['rating'];

const REQUIRED_FIELDS = ['category', 'problemDescription', 'consent'];

const MAX_TOP_LEVEL_KEYS = 60;
const MAX_ARRAY_ITEMS = 30;
const MAX_ARRAY_ITEM_LENGTH = 200;
const MAX_EXTRA_FIELD_VALUE_LENGTH = 2000;
const MAX_PAYLOAD_KEY_LENGTH = 100;

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function clampString(v, max) {
  if (typeof v !== 'string') return '';
  return v.slice(0, max);
}

function clampArrayOfStrings(v) {
  if (!Array.isArray(v)) return [];
  return v
    .slice(0, MAX_ARRAY_ITEMS)
    .filter((item) => typeof item === 'string')
    .map((item) => item.slice(0, MAX_ARRAY_ITEM_LENGTH));
}

/**
 * Validates and sanitizes a raw submission payload.
 * Returns { ok: true, clean, extraFields } or { ok: false, error }.
 */
function validateSubmission(body) {
  if (!isPlainObject(body)) {
    return { ok: false, error: 'Payload must be a JSON object.' };
  }

  const keys = Object.keys(body);
  if (keys.length === 0) {
    return { ok: false, error: 'Empty payload.' };
  }
  if (keys.length > MAX_TOP_LEVEL_KEYS) {
    return { ok: false, error: 'Payload has too many fields.' };
  }
  for (const k of keys) {
    if (k.length > MAX_PAYLOAD_KEY_LENGTH) {
      return { ok: false, error: 'Payload contains an invalid field name.' };
    }
  }

  for (const req of REQUIRED_FIELDS) {
    const val = body[req];
    const missing =
      val === undefined ||
      val === null ||
      (typeof val === 'string' && val.trim() === '');
    if (missing) {
      return { ok: false, error: `Missing required field: ${req}` };
    }
  }

  const clean = {};

  for (const [field, max] of Object.entries(KNOWN_STRING_FIELDS)) {
    if (body[field] !== undefined) {
      clean[field] = clampString(body[field], max);
    }
  }

  for (const field of KNOWN_ARRAY_FIELDS) {
    if (body[field] !== undefined) {
      clean[field] = clampArrayOfStrings(body[field]);
    }
  }

  for (const field of KNOWN_BOOLEAN_FIELDS) {
    if (body[field] !== undefined) {
      clean[field] = Boolean(body[field]);
    }
  }

  for (const field of KNOWN_NUMBER_FIELDS) {
    if (body[field] !== undefined) {
      const n = Number(body[field]);
      clean[field] = Number.isFinite(n) ? Math.max(0, Math.min(10, n)) : undefined;
    }
  }

  // Everything else (category-specific fields, future additions) goes into
  // extraFields, size-capped so a malicious payload can't blow up storage.
  const known = new Set([
    ...Object.keys(KNOWN_STRING_FIELDS),
    ...KNOWN_ARRAY_FIELDS,
    ...KNOWN_BOOLEAN_FIELDS,
    ...KNOWN_NUMBER_FIELDS,
  ]);

  const extraFields = {};
  for (const k of keys) {
    if (known.has(k)) continue;
    let v = body[k];
    if (typeof v === 'string') {
      v = v.slice(0, MAX_EXTRA_FIELD_VALUE_LENGTH);
    } else if (Array.isArray(v)) {
      v = clampArrayOfStrings(v);
    } else if (isPlainObject(v)) {
      // shallow-stringify nested objects to keep this bounded and predictable
      v = JSON.stringify(v).slice(0, MAX_EXTRA_FIELD_VALUE_LENGTH);
    } else if (typeof v !== 'number' && typeof v !== 'boolean' && v !== null) {
      continue;
    }
    extraFields[k] = v;
  }

  return { ok: true, clean, extraFields };
}

module.exports = { validateSubmission };
