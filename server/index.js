require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const { readSession } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const documentRoutes = require('./routes/documents');

const app = express();

// Baseline hardening at the app level. This is NOT a substitute for a
// real WAF/CDN (Cloudflare) in front of the app in production — see
// SECURITY.md — but it covers what's actually the app's own job:
// sane security headers, and blunting brute-force/scraping traffic.
app.use(helmet());
app.use(rateLimit({ windowMs: 60 * 1000, limit: 120 })); // 120 req/min/IP, global backstop

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(readSession);

app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api', apiRoutes);

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/healthz', (req, res) => res.json({ ok: true }));

// Anything else under /api that didn't match is a real 404, not the SPA fallback.
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong.' });
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`YUNIVESO server listening on :${port}`));
