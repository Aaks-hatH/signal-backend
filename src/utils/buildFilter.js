// Builds a Mongo filter object from admin dashboard query params.
// Shared between the paginated list endpoint, CSV export, and (optionally)
// analytics, so "export currently-filtered submissions" always matches what's
// on screen.
function buildFilter(query) {
  const filter = {};

  if (query.category) {
    filter.category = query.category;
  }
  if (query.severity) {
    filter.severity = query.severity;
  }
  if (query.wouldUse) {
    filter.wouldUse = query.wouldUse;
  }
  if (query.wouldPay) {
    filter.wouldPay = query.wouldPay;
  }
  if (query.frequency) {
    filter.frequency = query.frequency;
  }

  // Date range on serverReceivedAt
  if (query.dateFrom || query.dateTo) {
    filter.serverReceivedAt = {};
    if (query.dateFrom) {
      const from = new Date(query.dateFrom);
      if (!isNaN(from.getTime())) filter.serverReceivedAt.$gte = from;
    }
    if (query.dateTo) {
      const to = new Date(query.dateTo);
      if (!isNaN(to.getTime())) {
        // Make "to" inclusive of the whole day if only a date was given.
        to.setHours(23, 59, 59, 999);
        filter.serverReceivedAt.$lte = to;
      }
    }
    if (Object.keys(filter.serverReceivedAt).length === 0) {
      delete filter.serverReceivedAt;
    }
  }

  // Free-text search across problemDescription / idealDescription
  if (query.q && String(query.q).trim()) {
    const q = String(query.q).trim();
    filter.$or = [
      { problemDescription: { $regex: escapeRegex(q), $options: 'i' } },
      { idealDescription: { $regex: escapeRegex(q), $options: 'i' } },
    ];
  }

  return filter;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { buildFilter };
