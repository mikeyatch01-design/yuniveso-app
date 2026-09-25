require('dotenv').config();
const express = require('express');
// Express 4 doesn't forward a rejected promise from an `async (req, res)`
// route handler to the error-handling middleware — it becomes an
// unhandled rejection, which crashes the ENTIRE process (every request,
// every logged-in user) instead of just failing the one request that hit
// a bad query. This patches Express's router so that's no longer possible;
// it must be required after 'express' but before any route file runs.
require('express-async-errors');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const { readSession } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const documentRoutes = require('./routes/documents');
const adminRoutes = require('./routes/admin');

const app = express();

// Baseline hardening at the app level. This is NOT a substitute for a
// real WAF/CDN (Cloudflare) in front of the app in production — see
// SECURITY.md — but it covers what's actually the app's own job:
// sane security headers, and blunting brute-force/scraping traffic.
//
// upgrade-insecure-requests is dropped from helmet's defaults: it tells
// the browser to silently rewrite every http:// sub-resource request (css,
// js, fonts) to https:// first. Every URL this app loads is relative/
// same-origin, so it buys nothing in production (Railway already only
// serves the public domain over https) — but it actively breaks local
// development, where this server only speaks plain http. Safari enforces
// it strictly and just drops the request, which silently kills the page's
// own stylesheet with no visible error; Chromium browsers are laxer about
// it on localhost, which is why this only ever showed up in Safari.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'upgrade-insecure-requests': null,
    },
  },
}));
app.use(rateLimit({ windowMs: 60 * 1000, limit: 120 })); // 120 req/min/IP, global backstop

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(readSession);

app.get('/healthz', (req, res) => res.json({ ok: true }));

// One-time database setup, triggered by visiting a URL instead of needing
// a terminal/CLI — guarded by the same JWT_SECRET so it can't be run by a
// stranger who finds the URL. Registered BEFORE the auth-required API
// routes below, since those routes reject every request with no session
// (including this one) via their own router.use(requireAuth) — Express
// matches routes in registration order, so this has to come first to
// actually be reachable.
app.get('/api/setup/seed', async (req, res) => {
  if (!process.env.JWT_SECRET || req.query.key !== process.env.JWT_SECRET) {
    return res.status(403).json({ error: 'Forbidden.' });
  }
  try {
    const seedDatabase = require('./seed');
    await seedDatabase();
    res.json({ ok: true, message: 'Demo data seeded. Check the Railway deploy logs for login credentials.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Non-destructive: safe to run any time a new table gets added to
// schema.sql without wiping existing data (unlike /api/setup/seed, which
// resets everything back to demo data).
app.get('/api/setup/migrate', async (req, res) => {
  if (!process.env.JWT_SECRET || req.query.key !== process.env.JWT_SECRET) {
    return res.status(403).json({ error: 'Forbidden.' });
  }
  try {
    const { applySchema } = require('./seed');
    await applySchema();
    res.json({ ok: true, message: 'Schema applied.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api', adminRoutes);
app.use('/api', apiRoutes);

app.use(express.static(path.join(__dirname, '..', 'public')));

// Anything else under /api that didn't match is a real 404, not the SPA fallback.
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong.' });
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`YUNIVESO server listening on :${port}`));
