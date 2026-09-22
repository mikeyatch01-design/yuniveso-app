const jwt = require('jsonwebtoken');

// Every protected page and API call carries this httpOnly cookie. It's
// never readable from page JS (XSS can't steal it) and never sent
// cross-site (helps against CSRF) — see index.js for the cookie flags.
const COOKIE_NAME = 'yuniveso_session';

function issueToken(res, user) {
  const payload = {
    id: user.id,
    role: user.role,
    org_id: user.org_id,
    client_id: user.client_id,
    name: user.name,
  };
  const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '12h' });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 12 * 60 * 60 * 1000,
  });
}

function clearToken(res) {
  res.clearCookie(COOKIE_NAME);
}

// Attaches req.user from the cookie if present; does not reject the
// request. Routes that require a session use requireAuth() below.
function readSession(req, res, next) {
  const token = req.cookies[COOKIE_NAME];
  if (!token) return next();
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    // Expired or tampered — treat as logged out rather than erroring.
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Not signed in.' });
  next();
}

// Usage: requireRole('admin', 'super_admin')
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not signed in.' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Not allowed.' });
    next();
  };
}

module.exports = { COOKIE_NAME, issueToken, clearToken, readSession, requireAuth, requireRole };
