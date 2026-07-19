const express = require('express');
const Submission = require('../models/Submission');
const PageView = require('../models/PageView');
const Session = require('../models/Session');
const Event = require('../models/Event');
const ReplayChunk = require('../models/ReplayChunk');
const { requireAdmin } = require('../middleware/requireAdmin');
const { buildFilter } = require('../utils/buildFilter');
const { submissionsToCsv } = require('../utils/toCsv');
const llmSummary = require('../services/llmSummary');

const router = express.Router();

// Everything below this line requires a valid admin session.
router.use(requireAdmin);

router.get('/', (req, res) => res.redirect('/admin/dashboard'));

router.get('/dashboard', (req, res) => {
  res.render('dashboard');
});

const SORTABLE_FIELDS = new Set([
  'serverReceivedAt',
  'category',
  'severity',
  'rating',
  'wouldUse',
  'wouldPay',
  'name',
  'email',
]);

// GET /admin/api/submissions
router.get('/api/submissions', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize, 10) || 25));
    const sortField = SORTABLE_FIELDS.has(req.query.sortField)
      ? req.query.sortField
      : 'serverReceivedAt';
    const sortDir = req.query.sortDir === 'asc' ? 1 : -1;

    const filter = buildFilter(req.query);

    const [total, items] = await Promise.all([
      Submission.countDocuments(filter),
      Submission.find(filter)
        .sort({ [sortField]: sortDir })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
    ]);

    res.json({
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      items,
    });
  } catch (err) {
    console.error('[admin/api/submissions] error:', err);
    res.status(500).json({ error: 'Failed to load submissions.' });
  }
});

// GET /admin/api/submissions/:id — full detail for the expanded row view
router.get('/api/submissions/:id', async (req, res) => {
  try {
    const doc = await Submission.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ error: 'Not found.' });
    res.json(doc);
  } catch (err) {
    res.status(400).json({ error: 'Invalid id.' });
  }
});

// GET /admin/api/export.csv — respects the same filters as the list view
router.get('/api/export.csv', async (req, res) => {
  try {
    const filter = buildFilter(req.query);
    const items = await Submission.find(filter).sort({ serverReceivedAt: -1 }).lean();
    const csv = submissionsToCsv(items);

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="submissions-${new Date().toISOString().slice(0, 10)}.csv"`
    );
    res.send(csv);
  } catch (err) {
    console.error('[admin/api/export.csv] error:', err);
    res.status(500).json({ error: 'Failed to export CSV.' });
  }
});

// GET /admin/api/analytics — aggregate stats for the summary view
router.get('/api/analytics', async (req, res) => {
  try {
    const [
      totalCount,
      byDay,
      byCategory,
      bySeverity,
      byFrequency,
      avgRating,
      frustrationTagCounts,
      featurePriorityCounts,
      wouldUseCounts,
      wouldPayCounts,
      priceRangeCounts,
      contactOptIn,
      betaOptIn,
    ] = await Promise.all([
      Submission.countDocuments({}),
      Submission.aggregate([
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$serverReceivedAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Submission.aggregate([
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Submission.aggregate([
        { $group: { _id: '$severity', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Submission.aggregate([
        { $group: { _id: '$frequency', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Submission.aggregate([
        { $match: { rating: { $ne: null, $exists: true } } },
        { $group: { _id: null, avg: { $avg: '$rating' }, n: { $sum: 1 } } },
      ]),
      Submission.aggregate([
        { $unwind: '$frustrationTags' },
        { $group: { _id: '$frustrationTags', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 15 },
      ]),
      Submission.aggregate([
        { $unwind: '$featurePriorities' },
        { $group: { _id: '$featurePriorities', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 15 },
      ]),
      Submission.aggregate([
        { $group: { _id: '$wouldUse', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Submission.aggregate([
        { $group: { _id: '$wouldPay', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Submission.aggregate([
        { $group: { _id: '$priceRange', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      Submission.countDocuments({ openToContact: true }),
      Submission.countDocuments({ betaInterest: true }),
    ]);

    res.json({
      totalCount,
      byDay: byDay.map((d) => ({ date: d._id, count: d.count })),
      byCategory: byCategory.map((d) => ({ label: d._id || 'unspecified', count: d.count })),
      bySeverity: bySeverity.map((d) => ({ label: d._id || 'unspecified', count: d.count })),
      byFrequency: byFrequency.map((d) => ({ label: d._id || 'unspecified', count: d.count })),
      avgRating: avgRating[0] ? Number(avgRating[0].avg.toFixed(2)) : null,
      avgRatingSampleSize: avgRating[0] ? avgRating[0].n : 0,
      topFrustrationTags: frustrationTagCounts.map((d) => ({ label: d._id, count: d.count })),
      topFeaturePriorities: featurePriorityCounts.map((d) => ({ label: d._id, count: d.count })),
      wouldUseFunnel: wouldUseCounts.map((d) => ({ label: d._id || 'unspecified', count: d.count })),
      wouldPayFunnel: wouldPayCounts.map((d) => ({ label: d._id || 'unspecified', count: d.count })),
      priceRangeBreakdown: priceRangeCounts.map((d) => ({ label: d._id || 'unspecified', count: d.count })),
      contactOptInCount: contactOptIn,
      contactOptInPct: totalCount ? Math.round((contactOptIn / totalCount) * 100) : 0,
      betaOptInCount: betaOptIn,
      betaOptInPct: totalCount ? Math.round((betaOptIn / totalCount) * 100) : 0,
    });
  } catch (err) {
    console.error('[admin/api/analytics] error:', err);
    res.status(500).json({ error: 'Failed to load analytics.' });
  }
});

// GET /admin/api/traffic — page-view / IP analytics, cross-referenced with
// submission counts per IP so you can see how visits convert.
router.get('/api/traffic', async (req, res) => {
  try {
    const [
      totalPageViews,
      uniqueIps,
      totalSubmissions,
      viewsByDay,
      submissionsByIp,
      topIpsRaw,
    ] = await Promise.all([
      PageView.countDocuments({}),
      PageView.distinct('ip'),
      Submission.countDocuments({}),
      PageView.aggregate([
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      Submission.aggregate([
        { $match: { ip: { $exists: true, $ne: '' } } },
        { $group: { _id: '$ip', count: { $sum: 1 } } },
      ]),
      PageView.aggregate([
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: '$ip',
            views: { $sum: 1 },
            lastSeen: { $first: '$createdAt' },
            firstSeen: { $last: '$createdAt' },
            lastBrowser: { $first: '$parsedUA.browser' },
            lastOs: { $first: '$parsedUA.os' },
          },
        },
        { $sort: { views: -1 } },
        { $limit: 50 },
      ]),
    ]);

    const submissionCountByIp = new Map(submissionsByIp.map((d) => [d._id, d.count]));

    const topIps = topIpsRaw.map((d) => ({
      ip: d._id || 'unknown',
      views: d.views,
      submissions: submissionCountByIp.get(d._id) || 0,
      browser: d.lastBrowser || 'unknown',
      os: d.lastOs || 'unknown',
      firstSeen: d.firstSeen,
      lastSeen: d.lastSeen,
    }));

    res.json({
      totalPageViews,
      uniqueIpCount: uniqueIps.length,
      totalSubmissions,
      conversionRatePct: totalPageViews ? Math.round((totalSubmissions / totalPageViews) * 1000) / 10 : 0,
      viewsByDay: viewsByDay.map((d) => ({ date: d._id, count: d.count })),
      topIps,
    });
  } catch (err) {
    console.error('[admin/api/traffic] error:', err);
    res.status(500).json({ error: 'Failed to load traffic data.' });
  }
});

// GET /admin/api/sessions — list of visitor sessions with rolled-up
// behavioral stats, newest activity first.
router.get('/api/sessions', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize, 10) || 25));

    const filter = {};
    if (req.query.hasReplay === 'true') filter.replayEnabled = true;
    if (req.query.identified === 'true') filter.submissionId = { $ne: null };
    if (req.query.identified === 'false') filter.submissionId = null;

    const [total, items] = await Promise.all([
      Session.countDocuments(filter),
      Session.find(filter)
        .sort({ lastSeenAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .populate('submissionId', 'referenceCode name email')
        .lean(),
    ]);

    res.json({
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      items,
      llmEnabled: llmSummary.isEnabled(),
    });
  } catch (err) {
    console.error('[admin/api/sessions] error:', err);
    res.status(500).json({ error: 'Failed to load sessions.' });
  }
});

// GET /admin/api/sessions/:sessionId — everything needed to render the
// session detail view: the session doc, its page views, its behavioral
// events, and metadata about available replay chunks (fetched separately,
// on demand, since they can be large).
router.get('/api/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const [session, pageViews, events, replayChunkMeta] = await Promise.all([
      Session.findOne({ sessionId }).populate('submissionId', 'referenceCode name email').lean(),
      PageView.find({ sessionId }).sort({ createdAt: 1 }).limit(500).lean(),
      Event.find({ sessionId }).sort({ createdAt: 1 }).limit(2000).lean(),
      ReplayChunk.find({ sessionId }).sort({ seq: 1 }).select('seq startedAt endedAt path').lean(),
    ]);

    if (!session) return res.status(404).json({ error: 'Session not found.' });

    res.json({
      session,
      pageViews,
      events,
      replayChunks: replayChunkMeta,
      llmEnabled: llmSummary.isEnabled(),
    });
  } catch (err) {
    console.error('[admin/api/sessions/:sessionId] error:', err);
    res.status(500).json({ error: 'Failed to load session.' });
  }
});

// GET /admin/api/sessions/:sessionId/replay — concatenated raw rrweb event
// stream for the player. Separate endpoint since this can be sizeable and
// the session detail view shouldn't have to load it just to show stats.
router.get('/api/sessions/:sessionId/replay', async (req, res) => {
  try {
    const chunks = await ReplayChunk.find({ sessionId: req.params.sessionId })
      .sort({ seq: 1 })
      .select('events')
      .lean();
    const events = chunks.flatMap((c) => (Array.isArray(c.events) ? c.events : []));
    res.json({ events });
  } catch (err) {
    console.error('[admin/api/sessions/:sessionId/replay] error:', err);
    res.status(500).json({ error: 'Failed to load replay.' });
  }
});

// POST /admin/api/sessions/:sessionId/summarize — on-demand, optional LLM
// behavioral summary. 404s cleanly if LLM_ENABLED is not set, rather than
// silently no-op'ing, so the admin UI can explain why the button is disabled.
router.post('/api/sessions/:sessionId/summarize', async (req, res) => {
  try {
    if (!llmSummary.isEnabled()) {
      return res.status(404).json({ error: 'LLM summarization is disabled (set LLM_ENABLED=true).' });
    }

    const session = await Session.findOne({ sessionId: req.params.sessionId });
    if (!session) return res.status(404).json({ error: 'Session not found.' });

    const [events, pageViews] = await Promise.all([
      Event.find({ sessionId: session.sessionId }).lean(),
      PageView.find({ sessionId: session.sessionId }).lean(),
    ]);

    const { text, model } = await llmSummary.summarizeSession(session, events, pageViews);

    session.llmSummary = { text, generatedAt: new Date(), model };
    await session.save();

    res.json({ summary: session.llmSummary });
  } catch (err) {
    console.error('[admin/api/sessions/:sessionId/summarize] error:', err);
    res.status(500).json({ error: err.message || 'Failed to generate summary.' });
  }
});

// GET /admin/api/settings/llm — current state of the optional summarizer.
router.get('/api/settings/llm', (req, res) => {
  res.json({ ...llmSummary.getSettings(), defaultSystemPrompt: llmSummary.DEFAULT_SYSTEM_PROMPT });
});

// POST /admin/api/settings/llm — toggle on/off, switch provider, edit the
// system prompt. Off by default on every server restart regardless of what
// was set here — see comment in src/services/llmSummary.js.
router.post('/api/settings/llm', express.json(), (req, res) => {
  const { enabled, provider, systemPrompt } = req.body || {};
  const updated = llmSummary.updateSettings({ enabled, provider, systemPrompt });
  res.json(updated);
});

module.exports = router;
