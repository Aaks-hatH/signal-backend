const mongoose = require('mongoose');

const { Schema } = mongoose;

/*
 * One document per page load / tracked interaction on the survey site.
 * Deliberately lightweight — no cookies, no persistent visitor id, just
 * an IP + user-agent snapshot per hit. That's enough to compute unique
 * visitors, traffic-over-time, and a submission conversion rate without
 * building anything resembling a tracking profile of individual people.
 */
const PageViewSchema = new Schema({
  path: { type: String, maxlength: 300 },
  referrer: { type: String, maxlength: 500 },
  event: { type: String, maxlength: 50, default: 'pageview', index: true },

  ip: { type: String, maxlength: 100, index: true },
  userAgentRaw: { type: String, maxlength: 1000 },
  parsedUA: {
    browser: { type: String, maxlength: 200 },
    os: { type: String, maxlength: 200 },
    device: { type: String, maxlength: 200 },
  },

  createdAt: { type: Date, default: Date.now, index: true },
});

module.exports = mongoose.model('PageView', PageViewSchema);
