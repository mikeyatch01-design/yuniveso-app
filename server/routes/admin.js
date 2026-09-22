const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

function friendlyDbError(err) {
  if (err.code === 'ER_DUP_ENTRY') return 'That email address is already in use.';
  return err.message;
}

// ---------- Organizations ----------
// Super Admin: full control over every org. Admin: can only edit their own
// org's name/industry — never plan/mrr/status (that's platform billing,
// not something a firm sets about itself), and never anyone else's org.

router.post('/organizations', requireRole('super_admin'), async (req, res) => {
  const { name, industry, plan, mrr, status, admin_name, admin_email, admin_password } = req.body || {};
  if (!name || !admin_name || !admin_email || !admin_password) {
    return res.status(400).json({ error: 'Organization name and the first admin\'s name/email/password are required.' });
  }
  try {
    const [orgRes] = await pool.query(
      `INSERT INTO organizations (name, industry, plan, mrr, status) VALUES (?,?,?,?,?)`,
      [name, industry || '', plan || 'Trial', mrr || 0, status || 'Trial']
    );
    const hash = await bcrypt.hash(admin_password, 10);
    const initials = admin_name.trim().split(/\s+/).map(s => s[0]).join('').slice(0, 2).toUpperCase();
    await pool.query(
      `INSERT INTO users (org_id, role, name, title, email, password_hash, initials) VALUES (?, 'admin', ?, 'Admin', ?, ?, ?)`,
      [orgRes.insertId, admin_name, admin_email.trim().toLowerCase(), hash, initials]
    );
    res.json({ ok: true, id: orgRes.insertId });
  } catch (err) {
    res.status(400).json({ error: friendlyDbError(err) });
  }
});

router.patch('/organizations/:id', requireRole('super_admin', 'admin'), async (req, res) => {
  const orgId = Number(req.params.id);
  if (req.user.role === 'admin' && req.user.org_id !== orgId) return res.status(404).json({ error: 'Not found.' });

  const fields = [];
  const params = [];
  const { name, industry } = req.body || {};
  if (name != null) { fields.push('name = ?'); params.push(name); }
  if (industry != null) { fields.push('industry = ?'); params.push(industry); }

  // Only Super Admin may touch billing/status fields.
  if (req.user.role === 'super_admin') {
    const { plan, mrr, status } = req.body || {};
    if (plan != null) { fields.push('plan = ?'); params.push(plan); }
    if (mrr != null) { fields.push('mrr = ?'); params.push(mrr); }
    if (status != null) { fields.push('status = ?'); params.push(status); }
  }
  if (!fields.length) return res.status(400).json({ error: 'Nothing to update.' });

  await pool.query(`UPDATE organizations SET ${fields.join(', ')} WHERE id = ?`, [...params, orgId]);
  res.json({ ok: true });
});

router.delete('/organizations/:id', requireRole('super_admin'), async (req, res) => {
  await pool.query('DELETE FROM organizations WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// ---------- Users (admin accounts, employees, platform-wide user management) ----------
// Scope: Super Admin sees/edits everyone. Admin sees/edits only staff
// (admin+auditor) inside their own org — never another org, never a
// client login (those are managed via /clients, which owns that identity).

router.get('/users', requireRole('super_admin', 'admin'), async (req, res) => {
  let sql = `SELECT u.id, u.org_id, u.role, u.name, u.title, u.email, u.initials, u.created_at, o.name org_name
             FROM users u LEFT JOIN organizations o ON o.id = u.org_id WHERE 1=1`;
  const params = [];
  if (req.user.role === 'admin') {
    sql += ` AND u.org_id = ? AND u.role IN ('admin','auditor')`;
    params.push(req.user.org_id);
  } else if (req.query.org_id) {
    sql += ` AND u.org_id = ?`;
    params.push(req.query.org_id);
  }
  if (req.query.role) { sql += ` AND u.role = ?`; params.push(req.query.role); }
  sql += ' ORDER BY u.created_at DESC';
  const [rows] = await pool.query(sql, params);
  res.json({ users: rows });
});

router.post('/users', requireRole('super_admin', 'admin'), async (req, res) => {
  let { org_id, role, name, title, email, password } = req.body || {};
  if (req.user.role === 'admin') {
    org_id = req.user.org_id; // admins can only add staff to their own org
    if (role !== 'auditor') return res.status(403).json({ error: 'Admins can only add auditors.' });
  }
  if (!org_id || !role || !name || !email || !password) {
    return res.status(400).json({ error: 'Organization, role, name, email, and password are all required.' });
  }
  if (!['admin', 'auditor'].includes(role)) return res.status(400).json({ error: 'Invalid role.' });

  try {
    const hash = await bcrypt.hash(password, 10);
    const initials = name.trim().split(/\s+/).map(s => s[0]).join('').slice(0, 2).toUpperCase();
    const [result] = await pool.query(
      `INSERT INTO users (org_id, role, name, title, email, password_hash, initials) VALUES (?,?,?,?,?,?,?)`,
      [org_id, role, name, title || '', email.trim().toLowerCase(), hash, initials]
    );
    res.json({ ok: true, id: result.insertId });
  } catch (err) {
    res.status(400).json({ error: friendlyDbError(err) });
  }
});

async function assertUserEditable(actingUser, targetId) {
  const [[target]] = await pool.query('SELECT * FROM users WHERE id = ?', [targetId]);
  if (!target) return null;
  if (actingUser.role === 'super_admin') return target;
  if (actingUser.role === 'admin' && target.org_id === actingUser.org_id && ['admin', 'auditor'].includes(target.role)) return target;
  return null;
}

router.patch('/users/:id', requireRole('super_admin', 'admin'), async (req, res) => {
  const target = await assertUserEditable(req.user, req.params.id);
  if (!target) return res.status(404).json({ error: 'Not found.' });

  const fields = [];
  const params = [];
  const { name, title, email, password } = req.body || {};
  if (name != null) { fields.push('name = ?'); params.push(name); }
  if (title != null) { fields.push('title = ?'); params.push(title); }
  if (email != null) { fields.push('email = ?'); params.push(email.trim().toLowerCase()); }
  if (password) { fields.push('password_hash = ?'); params.push(await bcrypt.hash(password, 10)); }
  // Only Super Admin may move a user to a different org/role.
  if (req.user.role === 'super_admin') {
    const { org_id, role } = req.body || {};
    if (org_id != null) { fields.push('org_id = ?'); params.push(org_id); }
    if (role != null) { fields.push('role = ?'); params.push(role); }
  }
  if (!fields.length) return res.status(400).json({ error: 'Nothing to update.' });

  try {
    await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, [...params, req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: friendlyDbError(err) });
  }
});

router.delete('/users/:id', requireRole('super_admin', 'admin'), async (req, res) => {
  const target = await assertUserEditable(req.user, req.params.id);
  if (!target) return res.status(404).json({ error: 'Not found.' });
  if (target.id === req.user.id) return res.status(400).json({ error: "You can't remove your own account." });
  await pool.query('DELETE FROM users WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// ---------- Clients ----------
// A client "is" both a company row and exactly one portal login, created
// together — mirrors how the demo data is seeded.

router.post('/clients', requireRole('super_admin', 'admin'), async (req, res) => {
  let { org_id, name, industry, contact_name, contact_email, password } = req.body || {};
  if (req.user.role === 'admin') org_id = req.user.org_id;
  if (!org_id || !name || !contact_name || !contact_email || !password) {
    return res.status(400).json({ error: 'Company name, contact name/email, and a password are all required.' });
  }
  try {
    const [clientRes] = await pool.query(
      `INSERT INTO clients (org_id, name, industry, contact_name, contact_email) VALUES (?,?,?,?,?)`,
      [org_id, name, industry || '', contact_name, contact_email.trim().toLowerCase()]
    );
    const hash = await bcrypt.hash(password, 10);
    const initials = contact_name.trim().split(/\s+/).map(s => s[0]).join('').slice(0, 2).toUpperCase();
    await pool.query(
      `INSERT INTO users (org_id, client_id, role, name, title, email, password_hash, initials) VALUES (?,?,'client',?,'Finance Director',?,?,?)`,
      [org_id, clientRes.insertId, contact_name, contact_email.trim().toLowerCase(), hash, initials]
    );
    res.json({ ok: true, id: clientRes.insertId });
  } catch (err) {
    res.status(400).json({ error: friendlyDbError(err) });
  }
});

async function assertClientEditable(actingUser, clientId) {
  const [[client]] = await pool.query('SELECT * FROM clients WHERE id = ?', [clientId]);
  if (!client) return null;
  if (actingUser.role === 'super_admin') return client;
  if (actingUser.role === 'admin' && client.org_id === actingUser.org_id) return client;
  return null;
}

router.patch('/clients/:id', requireRole('super_admin', 'admin'), async (req, res) => {
  const client = await assertClientEditable(req.user, req.params.id);
  if (!client) return res.status(404).json({ error: 'Not found.' });

  const fields = [];
  const params = [];
  const { name, industry, contact_name, contact_email } = req.body || {};
  if (name != null) { fields.push('name = ?'); params.push(name); }
  if (industry != null) { fields.push('industry = ?'); params.push(industry); }
  if (contact_name != null) { fields.push('contact_name = ?'); params.push(contact_name); }
  if (contact_email != null) { fields.push('contact_email = ?'); params.push(contact_email); }
  if (!fields.length) return res.status(400).json({ error: 'Nothing to update.' });

  await pool.query(`UPDATE clients SET ${fields.join(', ')} WHERE id = ?`, [...params, req.params.id]);
  // Keep the portal login's contact fields in sync, since they're the same identity.
  if (contact_name != null || contact_email != null) {
    const loginFields = [];
    const loginParams = [];
    if (contact_name != null) { loginFields.push('name = ?'); loginParams.push(contact_name); }
    if (contact_email != null) { loginFields.push('email = ?'); loginParams.push(contact_email.trim().toLowerCase()); }
    await pool.query(`UPDATE users SET ${loginFields.join(', ')} WHERE client_id = ?`, [...loginParams, req.params.id]);
  }
  res.json({ ok: true });
});

router.delete('/clients/:id', requireRole('super_admin', 'admin'), async (req, res) => {
  const client = await assertClientEditable(req.user, req.params.id);
  if (!client) return res.status(404).json({ error: 'Not found.' });
  await pool.query('DELETE FROM clients WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

// ---------- Tasks ----------
router.get('/tasks', requireRole('admin', 'auditor'), async (req, res) => {
  let sql = `SELECT t.*, u.name assigned_name, u.initials assigned_initials, a.title audit_title
             FROM tasks t LEFT JOIN users u ON u.id = t.assigned_to LEFT JOIN audits a ON a.id = t.audit_id
             WHERE t.org_id = ?`;
  const params = [req.user.org_id];
  if (req.user.role === 'auditor') { sql += ' AND t.assigned_to = ?'; params.push(req.user.id); }
  sql += ' ORDER BY t.due_date ASC';
  const [rows] = await pool.query(sql, params);
  res.json({ tasks: rows });
});

router.post('/tasks', requireRole('admin'), async (req, res) => {
  const { audit_id, title, assigned_to, due_date } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Title is required.' });
  const [result] = await pool.query(
    `INSERT INTO tasks (org_id, audit_id, title, assigned_to, due_date, status) VALUES (?,?,?,?,?,'Open')`,
    [req.user.org_id, audit_id || null, title, assigned_to || null, due_date || null]
  );
  res.json({ ok: true, id: result.insertId });
});

router.patch('/tasks/:id', requireRole('admin', 'auditor'), async (req, res) => {
  const [[task]] = await pool.query('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
  if (!task || task.org_id !== req.user.org_id) return res.status(404).json({ error: 'Not found.' });
  if (req.user.role === 'auditor' && task.assigned_to !== req.user.id) return res.status(403).json({ error: 'Not your task.' });

  const fields = [];
  const params = [];
  if (req.user.role === 'admin') {
    const { title, assigned_to, due_date } = req.body || {};
    if (title != null) { fields.push('title = ?'); params.push(title); }
    if (assigned_to != null) { fields.push('assigned_to = ?'); params.push(assigned_to); }
    if (due_date != null) { fields.push('due_date = ?'); params.push(due_date); }
  }
  if (req.body.status != null) { fields.push('status = ?'); params.push(req.body.status); }
  if (!fields.length) return res.status(400).json({ error: 'Nothing to update.' });

  await pool.query(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`, [...params, req.params.id]);
  res.json({ ok: true });
});

router.delete('/tasks/:id', requireRole('admin'), async (req, res) => {
  const [[task]] = await pool.query('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
  if (!task || task.org_id !== req.user.org_id) return res.status(404).json({ error: 'Not found.' });
  await pool.query('DELETE FROM tasks WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
