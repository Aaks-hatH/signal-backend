const mongoose = require('mongoose');

const { Schema } = mongoose;

/*
 * One document per page load / tracked interaction on the survey site.
 * Carries a first-party sessionId (see src/utils/sessionId.js) so hits can
 * be grouped into a visit alongside behavioral events and replay — plus an
 * IP + user-agent snapshot per hit for traffic/conversion analytics.
 */
const PageViewSchema = new Schema({
  sessionId: { type: String, maxlength: 100, index: true },
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
