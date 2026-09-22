// ---------- Shared frontend helpers ----------
// Every protected page calls requireSession() first. It's a client-side
// convenience (hides the page shell if you're not signed in) — the real
// security boundary is server-side: every /api/* route re-checks the
// session cookie and re-scopes every query to that user's role, so this
// guard existing or not never changes what data is actually reachable.

const ROLE_HOME = {
  super_admin: '/super-admin.html',
  admin: '/admin-dashboard.html',
  auditor: '/auditor-dashboard.html',
  client: '/client-portal.html',
};

async function requireSession(allowedRoles) {
  const res = await fetch('/api/auth/me');
  if (!res.ok) {
    window.location.href = '/index.html';
    return null;
  }
  const { user } = await res.json();
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    window.location.href = ROLE_HOME[user.role] || '/index.html';
    return null;
  }
  applyUserChrome(user);
  return user;
}

function applyUserChrome(user) {
  document.querySelectorAll('[data-user-name]').forEach(el => { el.textContent = user.name; });
  document.querySelectorAll('[data-user-initials]').forEach(el => { el.textContent = initials(user.name); });
  const signOut = document.getElementById('signOutLink');
  if (signOut) {
    signOut.addEventListener('click', async (e) => {
      e.preventDefault();
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/index.html';
    });
  }
}

async function apiGet(url) {
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

async function apiPost(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

async function apiPatch(url, body) {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

async function apiDelete(url) {
  const res = await fetch(url, { method: 'DELETE' });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

function initials(name) {
  return (name || '?').trim().split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();
}

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, ch => HTML_ESCAPES[ch]);
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const RISK_BADGE = { Critical: 'badge-critical', High: 'badge-critical', Medium: 'badge-warning', Low: 'badge-success' };
const STATUS_BADGE = {
  'In Progress': 'badge-info', 'Review Required': 'badge-warning', Assigned: 'badge-muted',
  Approved: 'badge-success', Completed: 'badge-success', Received: 'badge-muted',
  Open: 'badge-critical', Overdue: 'badge-critical', 'In Remediation': 'badge-warning', Resolved: 'badge-success',
  Awaiting: 'badge-warning', 'In Review': 'badge-info', Active: 'badge-success', Trial: 'badge-muted', 'Payment due': 'badge-warning',
};

function badge(text, cls) {
  return `<span class="badge ${cls || 'badge-muted'}">${escapeHtml(text)}</span>`;
}

function riskBadge(level) { return badge(level, RISK_BADGE[level] || 'badge-muted'); }
function statusBadge(status) { return badge(status, STATUS_BADGE[status] || 'badge-muted'); }

function avatarSm(name) {
  return `<div class="avatar avatar-sm">${escapeHtml(initials(name))}</div>`;
}
