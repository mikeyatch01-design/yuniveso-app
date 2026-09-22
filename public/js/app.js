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
  wireNotifications();
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

// ---------- Notifications (the bell icon) ----------
// Works on any page with a `.icon-btn` containing a `.dot-flag` — that's
// every dashboard's bell icon already in the original markup, so no
// per-page HTML changes were needed to light this up everywhere at once.
const NOTIF_LEVEL_COLOR = { critical: 'var(--critical)', warning: 'var(--warning)', info: 'var(--info)' };

async function wireNotifications() {
  const btn = document.getElementById('notifBtn') || document.querySelector('.icon-btn');
  if (!btn || btn.dataset.notifWired) return;
  btn.dataset.notifWired = '1';
  const dot = btn.querySelector('.dot-flag');

  let notifications = [];
  try {
    ({ notifications } = await apiGet('/api/notifications'));
  } catch (err) { return; }

  if (dot) dot.style.display = notifications.length ? '' : 'none';

  btn.style.cursor = 'pointer';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleNotifPanel(btn, notifications);
  });

  // Some sidebars have their own "Notifications" nav link rather than
  // (or in addition to) the topbar bell — same data, same panel.
  const navLink = document.getElementById('notificationsNavLink');
  if (navLink) {
    navLink.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleNotifPanel(navLink, notifications);
    });
  }
}

function toggleNotifPanel(anchor, notifications) {
  const existing = document.getElementById('__notifPanel');
  if (existing) { existing.remove(); return; }

  const rect = anchor.getBoundingClientRect();
  const panel = document.createElement('div');
  panel.id = '__notifPanel';
  panel.style.cssText = `position:fixed;top:${rect.bottom + 8}px;right:${window.innerWidth - rect.right}px;width:320px;max-height:360px;overflow-y:auto;background:var(--surface);border:1px solid var(--border);border-radius:12px;box-shadow:0 12px 32px rgba(18,22,34,.18);z-index:200;padding:8px;`;
  panel.innerHTML = notifications.length
    ? notifications.map(n => `
        <div style="padding:10px 12px;border-radius:8px;font-size:13px;display:flex;gap:8px;align-items:flex-start;">
          <span style="width:7px;height:7px;border-radius:50%;margin-top:5px;flex:0 0 7px;background:${NOTIF_LEVEL_COLOR[n.level] || 'var(--text-3)'};"></span>
          <span>${escapeHtml(n.text)}</span>
        </div>
      `).join('')
    : `<div style="padding:16px;text-align:center;color:var(--text-3);font-size:13px;">You're all caught up.</div>`;
  document.body.appendChild(panel);

  setTimeout(() => {
    document.addEventListener('click', function closeOnOutside(ev) {
      if (!panel.contains(ev.target)) {
        panel.remove();
        document.removeEventListener('click', closeOnOutside);
      }
    });
  }, 0);
}

// ---------- Table search ----------
// Filters visible rows of a rendered table by plain substring match —
// call once after the table's initial render (re-filters live as you type,
// no need to re-call after later re-renders since it reads the live DOM).
function wireTableSearch(inputId, tbodyId) {
  const input = document.getElementById(inputId);
  const tbody = document.getElementById(tbodyId);
  if (!input || !tbody) return;
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    Array.from(tbody.rows).forEach(row => {
      row.style.display = !q || row.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
  });
}
