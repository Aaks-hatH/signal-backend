# Signal Intake — Backend + Admin Dashboard

Backend for the Signal Intake survey: a public `POST /api/submit` endpoint, and a
password-locked `/admin` dashboard for viewing, filtering, exporting, and
analyzing responses.

**Stack:** Node.js + Express, MongoDB (via Mongoose), server-rendered EJS +
vanilla JS for the admin UI, session-based single-password auth.

> This version uses **MongoDB** instead of SQLite. Since MongoDB is a separate
> managed/hosted database, you don't need a persistent disk on your app host —
> just a `MONGODB_URI` pointing at your database.

---

## 1. Project structure

```
signal-intake-backend/
├── server.js                 # entry point
├── src/
│   ├── db.js                 # MongoDB connection
│   ├── models/Submission.js  # Mongoose schema
│   ├── middleware/requireAdmin.js
│   ├── routes/submit.js      # POST /api/submit
│   ├── routes/adminAuth.js   # /admin/login, /admin/logout
│   ├── routes/admin.js       # /admin/dashboard + /admin/api/*
│   └── utils/                # validation, CSV export, reference codes, filters
├── views/                    # login.ejs, dashboard.ejs
├── public/                   # admin CSS/JS (dashboard only — no build step)
├── .env.example
└── package.json
```

---

## 2. Local setup

### Prerequisites
- Node.js 18+
- A MongoDB database. Easiest free option: [MongoDB Atlas](https://www.mongodb.com/cloud/atlas/register)
  (free M0 cluster is plenty for this). You can also run MongoDB locally or on
  Railway/Render/Fly as its own service.

### Steps

```bash
npm install
cp .env.example .env
```

Edit `.env`:

```env
PORT=3000
NODE_ENV=development
MONGODB_URI=mongodb+srv://user:password@cluster0.xxxxx.mongodb.net/signal_intake
ADMIN_PASSWORD=pick-a-strong-password
SESSION_SECRET=<generate with the command below>
ALLOWED_ORIGIN=http://localhost:5500
```

Generate a session secret:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Run it:
```bash
npm start
```

- Public submit endpoint: `http://localhost:3000/api/submit`
- Admin dashboard: `http://localhost:3000/admin/login`

---

## 3. MongoDB setup notes

- No manual schema/collection setup needed — Mongoose creates the
  `submissions` and `sessions` collections automatically on first write.
- Indexes (on `category`, `severity`, `wouldUse`, `wouldPay`, `priceRange`,
  `frequency`, `serverReceivedAt`, plus a text index on
  `problemDescription`/`idealDescription`) are declared in
  `src/models/Submission.js` and get created automatically the first time the
  app connects.
- Sessions are stored in MongoDB too (via `connect-mongo`), in a `sessions`
  collection with a 4-hour TTL — so admin logins survive app restarts/redeploys
  but still expire on their own.

If you'd rather use a different database (Postgres, SQLite, etc.), let me
know and I can swap the data layer — the routes and validation logic are
written against a thin model interface so this isn't a large change.

---

## 4. Deploying (Render, Railway, or Fly.io)

This is a normal long-running Node/Express server — no serverless adaptation
needed. Below are Render instructions since they're the simplest; Railway and
Fly are very similar (see notes at the end).

### Render — "Web Service"

1. Push this project to a GitHub repo (make sure `.env` is **not** committed —
   `.gitignore` already excludes it).
2. In the Render dashboard: **New → Web Service**, connect the repo.
3. Settings:
   - **Environment:** Node
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Instance type:** the free/starter tier is fine to begin with.
4. Under **Environment Variables**, add:
   - `MONGODB_URI` — your Atlas (or other) connection string
   - `ADMIN_PASSWORD`
   - `SESSION_SECRET`
   - `ALLOWED_ORIGIN` — your deployed survey's URL (see step 6 below)
   - `NODE_ENV=production`
   - `PORT` — Render sets this automatically; you don't need to set it yourself.
5. Deploy. Render will give you a URL like `https://signal-intake-backend.onrender.com`.

No persistent disk is required for the app service itself, since all
persistent data (submissions + sessions) lives in MongoDB, not on local disk.

### Railway

1. New Project → Deploy from GitHub repo.
2. Add the same environment variables as above under **Variables**.
3. Railway auto-detects Node and runs `npm install && npm start`.
4. (Optional) Add a MongoDB plugin/service from Railway's template gallery
   instead of using Atlas, and point `MONGODB_URI` at its connection string.

### Fly.io

1. `fly launch` in this directory (it will generate a `fly.toml` — accept the
   Node defaults, decline a Postgres/Redis add-on since you're using MongoDB
   Atlas).
2. `fly secrets set MONGODB_URI=... ADMIN_PASSWORD=... SESSION_SECRET=... ALLOWED_ORIGIN=... NODE_ENV=production`
3. `fly deploy`

---

## 5. After deploying — connect your survey

Once your server is live, open your survey's HTML file and find the
`SUBMIT_URL` constant near the top of the `<script>` tag:

```js
const SUBMIT_URL = "https://REPLACE-WITH-YOUR-SERVER-URL/api/submit";
```

Replace it with your real deployed URL, e.g.:

```js
const SUBMIT_URL = "https://signal-intake-backend.onrender.com/api/submit";
```

Then also set `ALLOWED_ORIGIN` on the server to your survey's deployed origin
(e.g. `https://my-survey.vercel.app`) so CORS allows the browser request
through, and redeploy the server if you change it.

---

## 6. Using the admin dashboard

- Go to `/admin/login` and enter `ADMIN_PASSWORD`.
- **Raw Submissions tab:** searchable/sortable/paginated table of every
  response. Click a row to see the full detail (all fields, all PII, IP,
  parsed user agent, and the full raw payload as originally received).
- Filters: category, severity, wouldUse, wouldPay, date range, and free-text
  search across `problemDescription`/`idealDescription`. Filters apply to
  both the table and the **Export CSV** button, so the CSV always matches
  what's on screen.
- **Analytics tab:** submissions-over-time, category/severity/frequency
  breakdowns, average current-solution rating, top frustration tags, top
  feature priorities, would-use/would-pay funnel, price range breakdown, and
  contact/beta opt-in rates — computed live from MongoDB via aggregation
  queries, charted with Chart.js (CDN-loaded, admin-only page).
- **Sessions & Replay tab:** every visitor session — page views, behavioral
  events, and (where consented) full rrweb screen replay. See section 7 for
  what's collected and why.
- Sessions expire after 4 hours of idle time. `/admin/logout` ends the
  session immediately.

---

## 7. Analytics & session replay — what's collected

The frontend (`signal-main/index.html`) now does more than a page-view ping:

| Collected always (no consent required) | Consent-gated (rrweb replay only) |
|---|---|
| Page path, referrer, browser/OS/device | Full visual DOM replay (mouse movement, clicks, scrolling) |
| A random first-party session id (cookie `signal_sid`, 30-day expiry) — groups hits into a visit, is **not** a fingerprint | |
| Clicks (incl. rage-click / dead-click detection), scroll depth thresholds, which form fields were focused/blurred and for how long | |

**What's deliberately excluded, even from replay:** rrweb runs with
`maskAllInputs: true`, so every `<input>`/`<textarea>` is rendered as `*`s in
the recording — replay shows *behavior*, never what someone typed. Form field
*names* (e.g. `email`) are logged for hesitation analytics, field *values*
never are, outside of the actual form submission itself.

**Identity resolution:** a session is only ever linked to a name/email when
the visitor submits the form themselves (see `src/routes/submit.js`). Nothing
in this system attempts to fingerprint, de-anonymize, or guess the identity
of a visitor who hasn't told you who they are.

**Consent:** a small dismissible notice bar appears on first visit (see the
`initConsentNotice` block in `signal-main/index.html`). It never blocks use
of the page. Accepting starts rrweb replay for that session; declining (or
ignoring it) does not — page views and aggregate behavioral analytics still
record either way, same as most product-analytics tools, but the screen
recording specifically requires the explicit "OK." The `/api/replay` route
also re-checks server-side that the session has consent on file before
accepting any replay data, so this can't be bypassed by editing the frontend.

**Optional AI summaries:** off by default (`LLM_ENABLED=false`). When turned
on (env var or the dashboard toggle), a free/open-source model — local Ollama
or Groq's free tier, not a paid API — can generate a short plain-language
summary of one session's *behavior* (pages visited, scroll depth, rage
clicks, funnel progress). The prompt explicitly forbids guessing who the
visitor is; see `src/services/llmSummary.js`.

**Data volume note:** the `Event` and `ReplayChunk` collections grow much
faster than `Submission`/`PageView`. For a long-running deployment, consider
adding a TTL index (e.g. 30–90 days) on `createdAt` in those two models if
you don't need indefinite retention.

---

## 8. Security notes

- Admin password is never stored in plaintext — it's read from
  `ADMIN_PASSWORD` and hashed with bcrypt in memory before every comparison.
- Incoming submissions are validated server-side: required fields enforced,
  string fields length-capped, arrays capped in length and item size, unknown
  top-level fields allowed but capped and quarantined into `extraFields`
  rather than freely merged, and the full original payload is *also* kept
  untouched in `rawJson` so nothing is lost even as the survey evolves.
- `express-rate-limit` caps `/api/submit` at 20 requests / 15 minutes / IP.
- `helmet` sets standard security headers (CSP is scoped to allow only the
  Chart.js CDN script + inline styles the dashboard needs).
- All dynamic values rendered into admin HTML go through the browser's
  `textContent`/HTML-escaping path in `public/js/dashboard.js`, not raw
  interpolation, to prevent stored-XSS from free-text survey fields.
- Session cookies are `httpOnly`, `sameSite: lax`, and `secure` in production.
- The reference code (`SIG-XXXXXX`) returned to the client is always
  generated server-side from a cryptographically random source — the client
  payload can't influence or spoof it.

---

## 9. Environment variables reference

| Variable         | Required | Description                                                        |
|------------------|----------|----------------------------------------------------------------------|
| `MONGODB_URI`    | yes      | MongoDB connection string                                            |
| `ADMIN_PASSWORD` | yes      | Plaintext password for `/admin` login (hashed in memory before use)  |
| `SESSION_SECRET` | yes      | Random string for signing session cookies                            |
| `ALLOWED_ORIGIN` | yes      | Your survey's deployed origin, for CORS on `/api/submit`             |
| `PORT`           | no       | Defaults to 3000 locally; most hosts set this automatically          |
| `NODE_ENV`       | no       | Set to `production` on your host so cookies are marked `secure`      |
| `LLM_ENABLED`    | no       | `true` to turn on optional AI session summaries. Default `false`.    |
| `LLM_PROVIDER`   | no       | `ollama` or `groq`. Default `ollama`.                                 |
| `OLLAMA_URL`     | no       | Local Ollama server URL. Default `http://localhost:11434`.           |
| `OLLAMA_MODEL`   | no       | Local model name. Default `llama3.1:8b`.                              |
| `GROQ_API_KEY`   | no       | Free-tier Groq API key, only needed if `LLM_PROVIDER=groq`.          |
| `GROQ_MODEL`     | no       | Groq model name. Default `llama-3.1-8b-instant`.                     |
| `LLM_SYSTEM_PROMPT` | no    | Custom summarizer prompt. Leave blank for the built-in default.      |
