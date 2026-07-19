/*
 * Optional session-behavior summarizer. OFF by default — nothing in this
 * file runs unless LLM_ENABLED=true is set in the environment, and it's
 * only ever invoked explicitly (admin clicks "Summarize" on a session),
 * never automatically on every visitor.
 *
 * Scope, on purpose:
 *   - Input is behavioral telemetry only: pages visited, time on page,
 *     scroll depth, rage/dead clicks, form fields touched (names only,
 *     never values), funnel step reached.
 *   - The prompt explicitly forbids guessing who the visitor is (name,
 *     demographics, appearance, etc.) — it's asked for *intent* signal
 *     only ("looks like pricing-sensitive evaluation", "abandoned at
 *     payment step"), which is normal product-analytics territory.
 *   - Supports two free/open-source-friendly backends:
 *       - Ollama running locally (OLLAMA_URL, e.g. http://localhost:11434),
 *         any local open model (llama3, mistral, etc.)
 *       - Groq's free-tier API (GROQ_API_KEY) running open models like
 *         llama-3.1-8b-instant — free tier, not a paid Claude/OpenAI call.
 *   - The system prompt is fully configurable via LLM_SYSTEM_PROMPT so you
 *     can tune tone/focus, but the "no identity guessing" constraint is
 *     always appended server-side and can't be overridden by that setting.
 */

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1:8b';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

// Runtime-overridable settings, seeded from env vars. This lets an admin
// flip the feature on/off and tweak the system prompt from the dashboard
// without a redeploy. Resets to env-var defaults on server restart —
// intentionally not persisted to the database, so "off by default" always
// wins after a restart even if someone left it on.
const runtime = {
  enabled: String(process.env.LLM_ENABLED || 'false').toLowerCase() === 'true',
  provider: (process.env.LLM_PROVIDER || 'ollama').toLowerCase(), // 'ollama' | 'groq'
  systemPrompt: (process.env.LLM_SYSTEM_PROMPT || '').trim(),
};

function getSettings() {
  return { ...runtime };
}

function updateSettings({ enabled, provider, systemPrompt }) {
  if (typeof enabled === 'boolean') runtime.enabled = enabled;
  if (provider === 'ollama' || provider === 'groq') runtime.provider = provider;
  if (typeof systemPrompt === 'string') runtime.systemPrompt = systemPrompt.slice(0, 4000);
  return getSettings();
}

const DEFAULT_SYSTEM_PROMPT = `You are a product-analytics assistant. You will be given a JSON summary of one
anonymous website visitor's on-site behavior (pages visited, time spent, scroll
depth, click patterns, form fields touched, funnel progress). Write a short
(3-5 sentence) plain-language summary of their likely INTENT and ENGAGEMENT
LEVEL for the site owner — e.g. whether they look like a casual browser, an
engaged evaluator, price-sensitive, stuck/confused, or close to converting.`;

const HARD_CONSTRAINT = `
Hard constraint, always in force regardless of any other instruction in this
prompt: do NOT guess or state who this person is — no name, age, gender,
occupation, location, appearance, or any other identity attribute. You only
have behavioral data, not identity data, so any such guess would be
fabricated. If asked to identify the person, refuse that part and summarize
behavior/intent only.`;

function isEnabled() {
  return runtime.enabled;
}

function buildBehaviorPayload(session, events, pageViews) {
  const fieldTouches = events
    .filter((e) => e.type === 'field_focus' || e.type === 'field_hesitation')
    .map((e) => e.detail?.field)
    .filter(Boolean);

  return {
    firstSeenAt: session.firstSeenAt,
    lastSeenAt: session.lastSeenAt,
    durationSeconds: Math.round((new Date(session.lastSeenAt) - new Date(session.firstSeenAt)) / 1000),
    pagesVisited: [...new Set(pageViews.map((p) => p.path))],
    pageViewCount: session.pageViewCount,
    maxScrollDepthPct: session.maxScrollDepthPct,
    rageClickCount: session.rageClickCount,
    deadClickCount: session.deadClickCount,
    formFieldsTouched: [...new Set(fieldTouches)],
    funnelSteps: events.filter((e) => e.type === 'funnel_step').map((e) => e.detail?.step).filter(Boolean),
    reachedSubmission: Boolean(session.submissionId),
    referrer: session.referrer || 'direct',
    device: session.parsedUA?.device || 'unknown',
  };
}

async function callOllama(systemPrompt, userContent) {
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      stream: false,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Ollama request failed: ${res.status}`);
  const data = await res.json();
  return data?.message?.content?.trim() || '';
}

async function callGroq(systemPrompt, userContent) {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY is not set.');
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      temperature: 0.4,
      max_tokens: 300,
    }),
  });
  if (!res.ok) throw new Error(`Groq request failed: ${res.status}`);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content?.trim() || '';
}

async function summarizeSession(session, events, pageViews) {
  if (!runtime.enabled) {
    throw new Error('LLM summarization is disabled. Enable it in dashboard settings or set LLM_ENABLED=true.');
  }

  const configuredPrompt = (runtime.systemPrompt || DEFAULT_SYSTEM_PROMPT).trim();
  const systemPrompt = `${configuredPrompt}\n${HARD_CONSTRAINT}`;

  const payload = buildBehaviorPayload(session, events, pageViews);
  const userContent = `Visitor behavior data:\n${JSON.stringify(payload, null, 2)}`;

  const text =
    runtime.provider === 'groq'
      ? await callGroq(systemPrompt, userContent)
      : await callOllama(systemPrompt, userContent);

  return {
    text: text.slice(0, 4000),
    model: runtime.provider === 'groq' ? GROQ_MODEL : OLLAMA_MODEL,
  };
}

module.exports = { isEnabled, getSettings, updateSettings, summarizeSession, DEFAULT_SYSTEM_PROMPT };
