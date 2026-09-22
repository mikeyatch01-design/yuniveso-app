const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');
const { auditScope, assertAuditVisible } = require('./api');

const router = express.Router();
router.use(requireAuth);

const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');

// Only these get accepted — bank statements and audit evidence are PDFs
// or spreadsheets, never anything executable.
const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
]);

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const auditId = Number(req.body.audit_id);
    const dir = path.join(UPLOAD_ROOT, String(req.user.org_id || 'platform'), String(auditId));
    await fs.promises.mkdir(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    // Never trust the client's filename for the on-disk name (path
    // traversal, collisions) — keep it only as `original_filename` in the DB.
    const safeExt = path.extname(file.originalname).replace(/[^.\w]/g, '').slice(0, 10);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) return cb(new Error('Only PDF, Excel, or image files are allowed.'));
    cb(null, true);
  },
});

// List documents for one audit (scoped: a client only ever sees this
// list if the audit itself belongs to them, checked below).
router.get('/', async (req, res) => {
  const auditId = Number(req.query.audit_id);
  if (!auditId || !(await assertAuditVisible(req.user, auditId))) return res.status(404).json({ error: 'Audit not found.' });

  const category = req.query.category;
  const params = [auditId];
  let sql = `SELECT d.id, d.category, d.requested_from, d.original_filename, d.status, d.due_date, d.size_bytes, d.created_at,
                    u.name uploaded_by_name
             FROM documents d LEFT JOIN users u ON u.id=d.uploaded_by WHERE d.audit_id=?`;
  if (category) { sql += ' AND d.category=?'; params.push(category); }
  sql += ' ORDER BY d.created_at DESC';
  const [rows] = await pool.query(sql, params);
  res.json({ documents: rows });
});

// Upload — clients use this for bank statements; admins/auditors for evidence.
router.post('/upload', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file provided.' });

    const auditId = Number(req.body.audit_id);
    if (!(await assertAuditVisible(req.user, auditId))) {
      await fs.promises.unlink(req.file.path).catch(() => {});
      return res.status(404).json({ error: 'Audit not found.' });
    }

    const [[audit]] = await pool.query('SELECT org_id FROM audits WHERE id=?', [auditId]);
    const category = req.user.role === 'client' ? 'bank_statement' : (req.body.category || 'evidence');
    const relPath = path.relative(path.join(__dirname, '..', '..'), req.file.path);

    const [result] = await pool.query(
      `INSERT INTO documents (org_id, audit_id, uploaded_by, category, requested_from, original_filename, stored_path, mime_type, size_bytes, status)
       VALUES (?,?,?,?,?,?,?,?,?, 'Received')`,
      [audit.org_id, auditId, req.user.id, category, req.body.requested_from || '', req.file.originalname, relPath, req.file.mimetype, req.file.size]
    );
    res.json({ ok: true, id: result.insertId });
  });
});

// Download — re-checks audit visibility on every download, not just at list time.
router.get('/:id/download', async (req, res) => {
  const [[doc]] = await pool.query('SELECT * FROM documents WHERE id=?', [req.params.id]);
  if (!doc) return res.status(404).json({ error: 'Not found.' });
  if (!(await assertAuditVisible(req.user, doc.audit_id))) return res.status(404).json({ error: 'Not found.' });

  const absPath = path.join(__dirname, '..', '..', doc.stored_path);
  res.download(absPath, doc.original_filename);
});

module.exports = router;
