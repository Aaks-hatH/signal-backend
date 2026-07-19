const mongoose = require('mongoose');

const { Schema } = mongoose;

/*
 * Fine-grained behavioral events, one document per event. Higher volume
 * than PageView, so this collection is meant to be capped/TTL'd in
 * production if it grows large (see note in README).
 */
const ALLOWED_TYPES = [
  'rage_click',
  'dead_click',
  'scroll_depth',
  'field_focus',
  'field_blur',
  'field_hesitation',
  'form_abandon',
  'funnel_step',
  'visibility_change',
  'idle',
  'click',
];

const EventSchema = new Schema({
  sessionId: { type: String, required: true, index: true, maxlength: 100 },
  type: { type: String, enum: ALLOWED_TYPES, required: true, index: true },
  path: { type: String, maxlength: 300 },

  // Free-form but capped detail payload — e.g. { selector, x, y } for
  // clicks, { pct } for scroll_depth, { field, ms } for hesitation.
  detail: { type: Schema.Types.Mixed, default: {} },

  clientTimestamp: { type: Number }, // ms epoch, as reported by the browser
  createdAt: { type: Date, default: Date.now, index: true },
});

EventSchema.statics.ALLOWED_TYPES = ALLOWED_TYPES;

module.exports = mongoose.model('Event', EventSchema);
