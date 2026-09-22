const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const pool = require('../db');
const { issueToken, clearToken, requireAuth } = require('../middleware/auth');

const router = express.Router();

// Slows down password-guessing without needing a WAF for this specific
// endpoint: 10 attempts per IP per 15 minutes, regardless of which
// email is being tried.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again in a few minutes.' },
});

// Where a role lands right after signing in.
const HOME_BY_ROLE = {
  super_admin: '/super-admin.html',
  admin: '/admin-dashboard.html',
  auditor: '/auditor-dashboard.html',
  client: '/client-portal.html',
};

router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [String(email).trim().toLowerCase()]);
  const user = rows[0];
  // Same generic error whether the email doesn't exist or the password is
  // wrong — telling them apart lets an attacker enumerate valid emails.
  const genericError = { error: 'Incorrect email or password.' };
  if (!user) return res.status(401).json(genericError);

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json(genericError);

  issueToken(res, user);
  res.json({
    ok: true,
    redirect: HOME_BY_ROLE[user.role] || '/index.html',
    user: { name: user.name, role: user.role },
  });
});

router.post('/logout', (req, res) => {
  clearToken(res);
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
