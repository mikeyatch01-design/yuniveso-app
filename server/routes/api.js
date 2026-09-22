const express = require('express');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// ---------- Scope helpers ----------
// Every list/detail query is filtered through one of these so a role can
// only ever get rows it's allowed to see — this is the actual security
// boundary (mirrors the approach used in the budgeting app: never trust
// the client to only ask for its own data, always filter server-side).

// Returns { where, params } restricting the `audits` table to what `user` may see.
function auditScope(user, alias = 'a') {
  if (user.role === 'super_admin') return { where: '1=1', params: [] };
  if (user.role === 'admin') return { where: `${alias}.org_id = ?`, params: [user.org_id] };
  if (user.role === 'auditor') {
    return {
      where: `${alias}.org_id = ? AND ${alias}.id IN (SELECT audit_id FROM audit_team WHERE user_id = ?)`,
      params: [user.org_id, user.id],
    };
  }
  // client — only their own company's audits
  return { where: `${alias}.org_id = ? AND ${alias}.client_id = ?`, params: [user.org_id, user.client_id] };
}

async function assertAuditVisible(user, auditId) {
  const { where, params } = auditScope(user);
  const [rows] = await pool.query(`SELECT id FROM audits a WHERE a.id = ? AND ${where}`, [auditId, ...params]);
  return rows.length > 0;
}

// ---------- Dashboard ----------
router.get('/dashboard', async (req, res) => {
  const user = req.user;

  if (user.role === 'super_admin') {
    const [[orgCount]] = await pool.query('SELECT COUNT(*) n FROM organizations');
    const [[clientCount]] = await pool.query('SELECT COUNT(*) n FROM clients');
    const [[auditCount]] = await pool.query('SELECT COUNT(*) n FROM audits');
    const [[userCount]] = await pool.query("SELECT COUNT(*) n FROM users WHERE role IN ('admin','auditor')");
    const [orgs] = await pool.query(`
      SELECT o.*,
        (SELECT COUNT(*) FROM users u WHERE u.org_id=o.id AND u.role='admin') admins,
        (SELECT COUNT(*) FROM clients c WHERE c.org_id=o.id) clients,
        (SELECT COUNT(*) FROM audits a WHERE a.org_id=o.id AND a.status NOT IN ('Completed')) active_audits
      FROM organizations o ORDER BY o.created_at DESC`);
    return res.json({
      kpis: { organizations: orgCount.n, clients: clientCount.n, audits: auditCount.n, employees: userCount.n },
      organizations: orgs,
    });
  }

  if (user.role === 'admin') {
    const [[active]] = await pool.query("SELECT COUNT(*) n FROM audits WHERE org_id=? AND status NOT IN ('Completed')", [user.org_id]);
    const [[pending]] = await pool.query("SELECT COUNT(*) n FROM audits WHERE org_id=? AND status='Review Required'", [user.org_id]);
    const [[completed]] = await pool.query("SELECT COUNT(*) n FROM audits WHERE org_id=? AND status='Completed'", [user.org_id]);
    const [[overdueTasks]] = await pool.query("SELECT COUNT(*) n FROM tasks WHERE org_id=? AND status='Overdue'", [user.org_id]);
    const [audits] = await pool.query(`
      SELECT a.*, c.name client_name, u.name lead_name, u.initials lead_initials
      FROM audits a JOIN clients c ON c.id=a.client_id
      LEFT JOIN users u ON u.id=a.lead_auditor_id
      WHERE a.org_id=? AND a.status != 'Completed' ORDER BY a.target_date ASC LIMIT 10`, [user.org_id]);
    const [team] = await pool.query(`
      SELECT u.id, u.name, u.initials,
        (SELECT COUNT(*) FROM audit_team t WHERE t.user_id=u.id) audits_count
      FROM users u WHERE u.org_id=? AND u.role='auditor'`, [user.org_id]);
    return res.json({
      kpis: { active_audits: active.n, pending_reviews: pending.n, completed_audits: completed.n, overdue_tasks: overdueTasks.n },
      audits, team,
    });
  }

  if (user.role === 'auditor') {
    const scope = auditScope(user);
    const [[assigned]] = await pool.query(`SELECT COUNT(*) n FROM audits a WHERE ${scope.where}`, scope.params);
    const [[findingsCount]] = await pool.query(
      `SELECT COUNT(*) n FROM findings f JOIN audits a ON a.id=f.audit_id WHERE ${scope.where}`, scope.params);
    const [audits] = await pool.query(`
      SELECT a.*, c.name client_name FROM audits a JOIN clients c ON c.id=a.client_id
      WHERE ${scope.where} ORDER BY a.target_date ASC`, scope.params);
    return res.json({
      kpis: { assigned_audits: assigned.n, findings_logged: findingsCount.n },
      audits,
    });
  }

  // client
  const scope = auditScope(user);
  const [audits] = await pool.query(`SELECT a.* FROM audits a WHERE ${scope.where} ORDER BY a.target_date ASC`, scope.params);
  const [[docsRequested]] = await pool.query(
    `SELECT COUNT(*) n FROM documents d JOIN audits a ON a.id=d.audit_id WHERE ${scope.where} AND d.category='bank_statement' AND d.status='Awaiting'`, scope.params);
  const [[docsSubmitted]] = await pool.query(
    `SELECT COUNT(*) n FROM documents d JOIN audits a ON a.id=d.audit_id WHERE ${scope.where} AND d.status IN ('Received','In Review','Approved')`, scope.params);
  const [[reportsCount]] = await pool.query(
    `SELECT COUNT(*) n FROM documents d JOIN audits a ON a.id=d.audit_id WHERE ${scope.where} AND d.category='report'`, scope.params);
  res.json({ kpis: { requested: docsRequested.n, submitted: docsSubmitted.n, reports: reportsCount.n }, audits });
});

// ---------- Organizations ----------
// Super Admin sees every org; Admin gets back just their own (a single-item
// list, so the frontend can use the same call either way).
router.get('/organizations', requireRole('super_admin', 'admin'), async (req, res) => {
  let sql = `
    SELECT o.*,
      (SELECT u.name FROM users u WHERE u.org_id=o.id AND u.role='admin' ORDER BY u.created_at LIMIT 1) admin_name,
      (SELECT u.email FROM users u WHERE u.org_id=o.id AND u.role='admin' ORDER BY u.created_at LIMIT 1) admin_email,
      (SELECT COUNT(*) FROM clients c WHERE c.org_id=o.id) clients,
      (SELECT COUNT(*) FROM audits a WHERE a.org_id=o.id) audits
    FROM organizations o`;
  const params = [];
  if (req.user.role === 'admin') { sql += ' WHERE o.id = ?'; params.push(req.user.org_id); }
  sql += ' ORDER BY o.created_at DESC';
  const [rows] = await pool.query(sql, params);
  res.json({ organizations: rows });
});

// ---------- Clients ----------
router.get('/clients', requireRole('super_admin', 'admin', 'auditor'), async (req, res) => {
  if (req.user.role === 'super_admin') {
    const [rows] = await pool.query('SELECT * FROM clients ORDER BY name');
    return res.json({ clients: rows });
  }
  const [rows] = await pool.query('SELECT * FROM clients WHERE org_id=? ORDER BY name', [req.user.org_id]);
  res.json({ clients: rows });
});

// ---------- Audits ----------
router.get('/audits', async (req, res) => {
  const scope = auditScope(req.user);
  const [rows] = await pool.query(`
    SELECT a.*, c.name client_name, u.name lead_name, u.initials lead_initials
    FROM audits a JOIN clients c ON c.id=a.client_id
    LEFT JOIN users u ON u.id=a.lead_auditor_id
    WHERE ${scope.where} ORDER BY a.target_date ASC`, scope.params);
  res.json({ audits: rows });
});

router.get('/audits/:id', async (req, res) => {
  const auditId = Number(req.params.id);
  if (!(await assertAuditVisible(req.user, auditId))) return res.status(404).json({ error: 'Audit not found.' });

  const [[audit]] = await pool.query(`
    SELECT a.*, c.name client_name FROM audits a JOIN clients c ON c.id=a.client_id WHERE a.id=?`, [auditId]);
  const [team] = await pool.query(`
    SELECT u.id, u.name, u.initials FROM audit_team t JOIN users u ON u.id=t.user_id WHERE t.audit_id=?`, [auditId]);
  // Both 'evidence' (staff-requested) and 'bank_statement' (client-uploaded)
  // show up here — this is the only place staff can see what a client has
  // actually submitted, so excluding either category would hide real work.
  const [documents] = await pool.query(
    `SELECT id, category, requested_from, original_filename, status, due_date, size_bytes, created_at
     FROM documents WHERE audit_id=? AND category IN ('evidence','bank_statement') ORDER BY created_at DESC`, [auditId]);
  const [procedures] = await pool.query(`
    SELECT p.*, u.name assigned_name, u.initials assigned_initials
    FROM testing_procedures p LEFT JOIN users u ON u.id=p.assigned_to WHERE p.audit_id=?`, [auditId]);
  const [interviews] = await pool.query('SELECT * FROM interviews WHERE audit_id=? ORDER BY scheduled_date', [auditId]);
  const [notes] = await pool.query(`
    SELECT n.*, u.name user_name, u.initials user_initials
    FROM notes n JOIN users u ON u.id=n.user_id WHERE n.audit_id=? ORDER BY n.created_at DESC`, [auditId]);
  const [findings] = await pool.query('SELECT * FROM findings WHERE audit_id=? ORDER BY created_at DESC', [auditId]);

  res.json({ audit, team, documents, procedures, interviews, notes, findings });
});

// ---------- Findings ----------
router.get('/findings', async (req, res) => {
  const scope = auditScope(req.user, 'a');
  const [rows] = await pool.query(`
    SELECT f.*, a.title audit_title, c.name client_name, u.name responsible_name, u.initials responsible_initials
    FROM findings f
    JOIN audits a ON a.id=f.audit_id
    JOIN clients c ON c.id=a.client_id
    LEFT JOIN users u ON u.id=f.responsible_id
    WHERE ${scope.where} ORDER BY f.created_at DESC`, scope.params);
  res.json({ findings: rows });
});

router.post('/findings', requireRole('admin', 'auditor'), async (req, res) => {
  const { audit_id, description, risk_level, department, responsible_id, target_date } = req.body || {};
  if (!(await assertAuditVisible(req.user, audit_id))) return res.status(404).json({ error: 'Audit not found.' });
  if (!description || !risk_level) return res.status(400).json({ error: 'Description and risk level are required.' });

  const [[{ n }]] = await pool.query('SELECT COUNT(*) n FROM findings WHERE org_id=?', [req.user.org_id]);
  const code = 'F-' + String(100 + n + 1);
  await pool.query(
    `INSERT INTO findings (org_id, audit_id, code, description, risk_level, department, responsible_id, target_date)
     VALUES (?,?,?,?,?,?,?,?)`,
    [req.user.org_id, audit_id, code, description, risk_level, department || '', responsible_id || null, target_date || null]
  );
  res.json({ ok: true, code });
});

// ---------- Reports & Analytics (admin/super admin) ----------
router.get('/reports/analytics', requireRole('admin', 'super_admin'), async (req, res) => {
  const orgFilter = req.user.role === 'admin' ? 'WHERE org_id=?' : '';
  const params = req.user.role === 'admin' ? [req.user.org_id] : [];

  const [[totals]] = await pool.query(`SELECT COUNT(*) total, SUM(status='Completed') completed FROM audits ${orgFilter}`, params);
  const [byRisk] = await pool.query(`
    SELECT risk_level, COUNT(*) n FROM findings f
    ${req.user.role === 'admin' ? 'WHERE org_id=?' : ''}
    GROUP BY risk_level`, params);
  const [byDept] = await pool.query(`
    SELECT department, COUNT(*) n FROM findings f
    ${req.user.role === 'admin' ? 'WHERE org_id=?' : ''}
    GROUP BY department ORDER BY n DESC`, params);
  const [productivity] = await pool.query(`
    SELECT u.name, u.initials,
      (SELECT COUNT(*) FROM audit_team t WHERE t.user_id=u.id) assigned,
      (SELECT COUNT(*) FROM audit_team t JOIN audits a ON a.id=t.audit_id WHERE t.user_id=u.id AND a.status='Completed') closed
    FROM users u WHERE u.role='auditor' ${req.user.role === 'admin' ? 'AND u.org_id=?' : ''}`, params);

  res.json({
    completion_rate: totals.total ? Math.round((totals.completed / totals.total) * 1000) / 10 : 0,
    findings_by_risk: byRisk,
    findings_by_department: byDept,
    productivity,
  });
});

// ---------- Messages (one thread per client company) ----------
async function resolveMessageClientId(user, requestedClientId) {
  const clientId = user.role === 'client' ? user.client_id : requestedClientId;
  if (!clientId) return null;
  const [[client]] = await pool.query('SELECT * FROM clients WHERE id = ?', [clientId]);
  if (!client) return null;
  if (user.role === 'client' && client.id !== user.client_id) return null;
  if (user.role === 'admin' && client.org_id !== user.org_id) return null;
  if (user.role === 'auditor' && client.org_id !== user.org_id) return null;
  return client;
}

router.get('/messages', async (req, res) => {
  const client = await resolveMessageClientId(req.user, Number(req.query.client_id));
  if (!client) return res.status(404).json({ error: 'Not found.' });
  const [rows] = await pool.query(`
    SELECT m.*, u.name sender_name, u.role sender_role, u.initials sender_initials
    FROM messages m JOIN users u ON u.id = m.sender_id
    WHERE m.client_id = ? ORDER BY m.created_at ASC`, [client.id]);
  res.json({ messages: rows, client_id: client.id, client_name: client.name });
});

router.post('/messages', async (req, res) => {
  const client = await resolveMessageClientId(req.user, Number(req.body.client_id));
  if (!client) return res.status(404).json({ error: 'Not found.' });
  const body = (req.body.body || '').trim();
  if (!body) return res.status(400).json({ error: 'Message cannot be empty.' });
  await pool.query('INSERT INTO messages (org_id, client_id, sender_id, body) VALUES (?,?,?,?)', [client.org_id, client.id, req.user.id, body]);
  res.json({ ok: true });
});

module.exports = router;
module.exports.auditScope = auditScope;
module.exports.assertAuditVisible = assertAuditVisible;
