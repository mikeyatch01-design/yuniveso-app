require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');

function makeSimplePdf(title, lines) {
  const bodyLines = lines.map((l, i) => `(${l.replace(/[()\\]/g, '')}) Tj 0 -18 Td`).join('\n');
  const streamContent = `BT /F1 14 Tf 40 260 Td (${title.replace(/[()\\]/g, '')}) Tj 0 -26 Td /F1 10 Tf\n${bodyLines}\nET`;
  const objects = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/Resources<</Font<</F1 4 0 R>>>>/MediaBox[0 0 400 300]/Contents 5 0 R>>',
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
    `<</Length ${Buffer.byteLength(streamContent)}>>\nstream\n${streamContent}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj${obj}endobj\n`;
  });
  const xrefStart = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

async function seedDatabase() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
  });

  console.log('Applying schema...');
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await conn.query(schema);

  console.log('Clearing existing demo data...');
  await conn.query('SET FOREIGN_KEY_CHECKS=0');
  for (const t of ['tasks', 'notes', 'interviews', 'testing_procedures', 'documents', 'findings', 'audit_team', 'audits', 'users', 'clients', 'organizations']) {
    await conn.query(`DELETE FROM ${t}`);
  }
  await conn.query('SET FOREIGN_KEY_CHECKS=1');

  const PASSWORD = 'Demo1234!';
  const hash = await bcrypt.hash(PASSWORD, 10);

  await conn.query(
    `INSERT INTO users (org_id, client_id, role, name, title, email, password_hash, initials) VALUES (NULL,NULL,'super_admin',?,?,?,?,?)`,
    ['Sandra Aitken', 'Super Admin', 'super@yuniveso.com', hash, 'SA']
  );

  const [orgRes] = await conn.query(
    `INSERT INTO organizations (name, industry, plan, mrr, status) VALUES (?,?,?,?,?)`,
    ['Beaumont Assurance Co.', 'Manufacturing', 'Enterprise', 21800, 'Active']
  );
  const orgId = orgRes.insertId;

  const [adminRes] = await conn.query(
    `INSERT INTO users (org_id, role, name, title, email, password_hash, initials) VALUES (?, 'admin', ?, 'Admin', ?, ?, ?)`,
    [orgId, 'Marcus Okoye', 'admin@yuniveso.com', hash, 'MO']
  );

  const auditorDefs = [
    ['Dana Castillo', 'Senior Auditor', 'dana@yuniveso.com', 'DC'],
    ['Rehan Nasser', 'Auditor', 'rehan@yuniveso.com', 'RN'],
    ['Tasha Liang', 'Auditor', 'tasha@yuniveso.com', 'TL'],
    ['Jonah Mbeki', 'Auditor', 'jonah@yuniveso.com', 'JM'],
  ];
  const auditorIds = {};
  for (const [name, title, email, initials] of auditorDefs) {
    const [r] = await conn.query(
      `INSERT INTO users (org_id, role, name, title, email, password_hash, initials) VALUES (?, 'auditor', ?, ?, ?, ?, ?)`,
      [orgId, name, title, email, hash, initials]
    );
    auditorIds[initials] = r.insertId;
  }

  const clientDefs = [
    ['Kesteven Manufacturing', 'Manufacturing', 'Elena Wren', 'elena@kesteven-demo.com'],
    ['Solent Health Group', 'Healthcare', 'Priya Shah', 'priya@solent-demo.com'],
    ['Fairholt Retail Ltd.', 'Retail', 'Omar Siddiqui', 'omar@fairholt-demo.com'],
    ['Norrmark Energy AB', 'Energy', 'Freya Lindqvist', 'freya@norrmark-demo.com'],
    ['Castellane Group', 'Financial services', 'Victor Hale', 'victor@castellane-demo.com'],
  ];
  const clientIds = {};
  for (const [name, industry, contact, email] of clientDefs) {
    const [r] = await conn.query(
      `INSERT INTO clients (org_id, name, industry, contact_name, contact_email) VALUES (?,?,?,?,?)`,
      [orgId, name, industry, contact, email]
    );
    clientIds[name] = r.insertId;
    const initials = contact.split(' ').map(s => s[0]).join('').toUpperCase();
    await conn.query(
      `INSERT INTO users (org_id, client_id, role, name, title, email, password_hash, initials) VALUES (?,?,'client',?, 'Finance Director', ?, ?, ?)`,
      [orgId, r.insertId, contact, email, hash, initials]
    );
  }

  const auditDefs = [
    { title: 'FY26 Financial Statement Audit', client: 'Kesteven Manufacturing', phase: 'Field Work', status: 'In Progress', risk: 'High', lead: 'DC', team: ['DC', 'RN'], progress: 58, target: '2026-10-03', scope: 'Full-scope statutory audit, FY2026' },
    { title: 'Internal Controls Review', client: 'Solent Health Group', phase: 'Reporting', status: 'Review Required', risk: 'High', lead: 'RN', team: ['RN'], progress: 82, target: '2026-09-26', scope: 'Controls walkthrough, FY2026' },
    { title: 'Compliance Audit', client: 'Fairholt Retail Ltd.', phase: 'Planning', status: 'Assigned', risk: 'Low', lead: 'TL', team: ['TL'], progress: 12, target: '2026-10-18', scope: 'Regulatory compliance review' },
    { title: 'Inventory Controls Review', client: 'Norrmark Energy AB', phase: 'Findings', status: 'In Progress', risk: 'High', lead: 'JM', team: ['JM'], progress: 71, target: '2026-09-29', scope: 'Inventory & warehouse controls' },
    { title: 'Tax Compliance Review', client: 'Castellane Group', phase: 'Reporting', status: 'Approved', risk: 'Medium', lead: 'DC', team: ['DC'], progress: 95, target: '2026-09-24', scope: 'Corporate tax compliance review' },
    { title: 'Q3 Internal Controls', client: 'Kesteven Manufacturing', phase: 'Reporting', status: 'Completed', risk: 'Low', lead: 'DC', team: ['DC'], progress: 100, target: '2026-09-10', scope: 'Quarterly controls testing' },
  ];
  const auditIds = {};
  let codeSeq = 142;
  for (const d of auditDefs) {
    const code = `AUD-2026-${String(codeSeq--).padStart(4, '0')}`;
    const [r] = await conn.query(
      `INSERT INTO audits (org_id, client_id, engagement_code, title, phase, status, risk_level, lead_auditor_id, start_date, target_date, progress_pct, scope_text)
       VALUES (?,?,?,?,?,?,?,?, '2026-08-18', ?, ?, ?)`,
      [orgId, clientIds[d.client], code, d.title, d.phase, d.status, d.risk, auditorIds[d.lead], d.target, d.progress, d.scope]
    );
    auditIds[d.title] = r.insertId;
    for (const initials of d.team) {
      await conn.query('INSERT INTO audit_team (audit_id, user_id) VALUES (?,?)', [r.insertId, auditorIds[initials]]);
    }
  }

  const fya = auditIds['FY26 Financial Statement Audit'];

  await conn.query(
    `INSERT INTO testing_procedures (audit_id, procedure_text, assertion, assigned_to, result) VALUES
     (?, 'Confirm bank balances with third parties', 'Existence', ?, 'No exceptions'),
     (?, 'Test revenue cut-off for Q4 shipments', 'Cut-off', ?, 'Exception noted'),
     (?, 'Recalculate depreciation on fixed assets', 'Accuracy', ?, 'No exceptions'),
     (?, 'Vouch a sample of AP invoices to source docs', 'Occurrence', ?, 'In progress')`,
    [fya, auditorIds.DC, fya, auditorIds.RN, fya, auditorIds.DC, fya, auditorIds.TL]
  );

  await conn.query(
    `INSERT INTO interviews (audit_id, topic, scheduled_date, auditor_id, status) VALUES
     (?, 'CFO — revenue recognition walkthrough', '2026-09-12', ?, 'Complete'),
     (?, 'Controller — payroll process', '2026-09-15', ?, 'Complete'),
     (?, 'Warehouse manager — inventory controls', '2026-09-25', ?, 'Scheduled')`,
    [fya, auditorIds.DC, fya, auditorIds.RN, fya, auditorIds.RN]
  );

  await conn.query(
    `INSERT INTO notes (audit_id, user_id, body) VALUES
     (?, ?, 'Cut-off exception on shipment #4471 — flagged for finding review. @Dana please confirm shipping date.'),
     (?, ?, 'Confirmed with client — shipment recorded one day early. Drafting finding now.')`,
    [fya, auditorIds.RN, fya, auditorIds.DC]
  );

  const findingDefs = [
    [fya, 'F-0142', 'Revenue recognized one day before shipment cut-off for Q4 orders', 'Critical', 'Revenue', 'RN', '2026-09-30', 'In Remediation'],
    [auditIds['Inventory Controls Review'], 'F-0131', 'Inventory count variance of 4.2% at northern warehouse site', 'High', 'Inventory', 'JM', '2026-10-08', 'Open'],
    [auditIds['Internal Controls Review'], 'F-0139', 'Segregation of duties gap in vendor payment approval workflow', 'Critical', 'Accounts Payable', 'TL', '2026-10-05', 'Open'],
    [fya, 'F-0137', 'Fixed asset register not reconciled to GL for 3 consecutive months', 'Critical', 'Fixed Assets', 'DC', '2026-10-12', 'In Remediation'],
    [auditIds['Q3 Internal Controls'], 'F-0119', 'Petty cash reconciliation discrepancy of $340 at regional office', 'Low', 'Treasury', 'DC', '2026-11-01', 'Resolved'],
  ];
  for (const [auditId, code, desc, risk, dept, lead, target, status] of findingDefs) {
    await conn.query(
      `INSERT INTO findings (org_id, audit_id, code, description, risk_level, department, responsible_id, target_date, status) VALUES (?,?,?,?,?,?,?,?,?)`,
      [orgId, auditId, code, desc, risk, dept, auditorIds[lead], target, status]
    );
  }

  const uploadsRoot = path.join(__dirname, '..', 'uploads', String(orgId), String(fya));
  await fs.promises.mkdir(uploadsRoot, { recursive: true });

  async function seedDoc({ auditId, category, requestedFrom, filename, status, dueDate, uploadedBy, pdfLines }) {
    const dir = path.join(__dirname, '..', 'uploads', String(orgId), String(auditId));
    await fs.promises.mkdir(dir, { recursive: true });
    const storedName = `${Date.now()}-${Math.round(Math.random() * 1e9)}.pdf`;
    const fullPath = path.join(dir, storedName);
    fs.writeFileSync(fullPath, makeSimplePdf(filename, pdfLines));
    const relPath = path.relative(path.join(__dirname, '..'), fullPath);
    const stat = fs.statSync(fullPath);
    await conn.query(
      `INSERT INTO documents (org_id, audit_id, uploaded_by, category, requested_from, original_filename, stored_path, mime_type, size_bytes, status, due_date)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [orgId, auditId, uploadedBy || null, category, requestedFrom || '', filename, relPath, 'application/pdf', stat.size, status, dueDate || null]
    );
  }

  await seedDoc({ auditId: fya, category: 'evidence', requestedFrom: 'Client', filename: 'Payroll Summary - August.pdf', status: 'Received', pdfLines: ['Demo placeholder document.', 'Category: Payroll evidence.'] });
  await seedDoc({ auditId: fya, category: 'evidence', requestedFrom: 'Client', filename: 'Vendor Contracts (top 20).pdf', status: 'Received', pdfLines: ['Demo placeholder document.', 'Category: Accounts payable evidence.'] });
  await seedDoc({ auditId: fya, category: 'bank_statement', requestedFrom: 'Dana Castillo', filename: 'Q3 Bank Reconciliation.pdf', status: 'Awaiting', dueDate: '2026-09-25' });
  await seedDoc({ auditId: fya, category: 'bank_statement', requestedFrom: 'Dana Castillo', filename: 'Fixed Asset Register.pdf', status: 'Awaiting', dueDate: '2026-09-28' });
  await seedDoc({ auditId: auditIds['Q3 Internal Controls'], category: 'report', filename: 'FY25 Final Audit Report.pdf', status: 'Approved', uploadedBy: adminRes.insertId, pdfLines: ['Demo placeholder final report.'] });
  await seedDoc({ auditId: auditIds['Q3 Internal Controls'], category: 'report', filename: 'FY25 Management Letter.pdf', status: 'Approved', uploadedBy: adminRes.insertId, pdfLines: ['Demo placeholder management letter.'] });

  await conn.query(
    `INSERT INTO tasks (org_id, audit_id, title, assigned_to, due_date, status) VALUES
     (?, ?, 'Field work sign-off', ?, '2026-09-28', 'Open'),
     (?, ?, 'Draft findings memo', ?, '2026-09-24', 'Overdue'),
     (?, NULL, 'Planning memo review', ?, '2026-10-10', 'Open')`,
    [orgId, fya, auditorIds.DC, orgId, auditIds['Inventory Controls Review'], auditorIds.JM, orgId, auditorIds.TL]
  );

  const [org2Res] = await conn.query(
    `INSERT INTO organizations (name, industry, plan, mrr, status) VALUES (?,?,?,?,?)`,
    ['Harrow & Finch LLP', 'Financial services', 'Enterprise', 14200, 'Active']
  );
  const org2Id = org2Res.insertId;
  await conn.query(
    `INSERT INTO users (org_id, role, name, title, email, password_hash, initials) VALUES (?, 'admin', 'Priya Anand', 'Admin', 'admin2@yuniveso.com', ?, 'PA')`,
    [org2Id, hash]
  );
  const [c2] = await conn.query(
    `INSERT INTO clients (org_id, name, industry, contact_name, contact_email) VALUES (?, 'Whitfield & Roe', 'Healthcare', 'Grace Lin', 'grace@whitfield-demo.com')`,
    [org2Id]
  );
  await conn.query(
    `INSERT INTO audits (org_id, client_id, engagement_code, title, phase, status, risk_level, start_date, target_date, progress_pct, scope_text)
     VALUES (?,?, 'AUD-2026-0201', 'Statutory Audit FY26', 'Planning', 'Assigned', 'Medium', '2026-09-01', '2026-11-15', 8, 'Statutory audit, first year of engagement')`,
    [org2Id, c2.insertId]
  );

  await conn.end();

  console.log('\nSeed complete.\n');
  console.log('Demo login password for every account below:', PASSWORD, '\n');
  console.log('  Super Admin : super@yuniveso.com');
  console.log('  Firm Admin  : admin@yuniveso.com     (Beaumont Assurance Co.)');
  console.log('  Auditor     : dana@yuniveso.com       (Senior Auditor)');
  console.log('  Auditor     : rehan@yuniveso.com');
  console.log('  Client      : elena@kesteven-demo.com (Kesteven Manufacturing)');
}

module.exports = seedDatabase;

if (require.main === module) {
  seedDatabase().catch((err) => { console.error(err); process.exit(1); });
}

Commit that, and let me know when it's done — then we'll trigger the seed for real.

✻ Worked for 1m 16s · done 7:30 PM

❯ where should i put this in index or seed

This one goes in server/seed.js — that's the file that currently has the wrong content (a copy of index.js). server/index.js is already correct and doesn't need touching right now.

✻ Brewed for 3s · done 7:31 PM

❯ done

  Ran 1 shell command

Both files are correct now. Railway should auto-redeploy from this commit — let's wait for that to finish, then trigger the seed.

Railway should be redeploying now with the fix. I'll check back in about a minute and a half to trigger the seed automatically — no action needed from you right now.

✻ Cogitated for 23s · done 7:34 PM

❯ look at it

  Ran 1 shell command

Good progress actually — that error means the fix worked (we're now hitting the right route), but the secret key doesn't match what's stored in Railway's JWT_SECRET variable. Might've gotten a stray space or been cut off when pasting. Let's double-check it.

1. Go to Railway → your yuniveso-app service → Variables tab
2. Find JWT_SECRET
3. Click on its value to edit it
4. Delete whatever's there and paste this exact value:

433d9be3c1a58565cac835ae14754629b96f0a54f25239ef71298472cb347804eb8289e41c673861d688bcac26ac532a

5. Save it, then click the "Apply changes" / deploy button if it appears

Let me know once that's redeployed.

✻ Crunched for 23s · done 7:36 PM

✻ Claude resuming /loop wakeup (Sep 22 7:37pm)

  Ran 1 shell command

Still "Forbidden" — this was just my scheduled check firing automatically, from before you fixed the variable. Have you updated JWT_SECRET in Railway and redeployed yet? Let me know once that's done and I'll try again.

✻ Crunched for 14s · done 7:37 PM

❯ done

  Ran 1 shell command

That's odd — let's check two things:

1. After you pasted the new JWT_SECRET value, did you see a deployment actually start (a progress bar or "Deploying" status), or did it just save the variable without redeploying?
2. Can you click on the JWT_SECRET value field again and copy-paste back to me exactly what's currently saved there? I want to check for a stray space or missing character.

✻ Worked for 16s · done 7:40 PM

❯ 433d9be3c1a58565cac835ae14754629b96f0a54f25239ef71298472cb347804eb8289e41c673861d688bcac26ac532a

That value is exactly right. So the issue must be that the app hasn't actually redeployed with this new value yet. Can you check the Deployments tab on your yuniveso-app service — is there a new deployment listed after you changed that variable, and does it show as finished/successful (not still "Building" or "Deploying")?

✻ Churned for 5s · done 7:40 PM

❯ ITS DONE

  Ran 1 shell command

Found the bug — the seed script tries to create a placeholder file even for "Awaiting" documents that don't actually have content yet (nothing uploaded), which crashes. Let me fix it.

  Read 1 file

⏺ Update(server/seed.js)
Added 13 lines, removed 1 line
  await fs.promises.mkdir(uploadsRoot, { recursive: true });

  async function seedDoc({ auditId, category, requestedFrom, filename, status, dueDate, uploadedBy, pdfLines }) {
    // "Awaiting" means nothing has actually been uploaded yet — no file to
    // write, just a request record (matches how a real upload creates the
    // row: the row only exists once a file is attached to it).
    if (status === 'Awaiting') {
      await conn.query(
        `INSERT INTO documents (org_id, audit_id, uploaded_by, category, requested_from, original_filename, stored_path, mime_type, size_bytes, status, due_date)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [orgId, auditId, uploadedBy || null, category, requestedFrom || '', filename, '', '', 0, status, dueDate || null]
      );
      return;
    }

    const dir = path.join(__dirname, '..', 'uploads', String(orgId), String(auditId));
    await fs.promises.mkdir(dir, { recursive: true });
    const storedName = `${Date.now()}-${Math.round(Math.random() * 1e9)}.pdf`;
    const fullPath = path.join(dir, storedName);
    fs.writeFileSync(fullPath, makeSimplePdf(filename, pdfLines));
    fs.writeFileSync(fullPath, makeSimplePdf(filename, pdfLines || [filename]));
    const relPath = path.relative(path.join(__dirname, '..'), fullPath);
    const stat = fs.statSync(fullPath);
    await conn.query(

  Ran 1 shell command

We need one more small fix in server/seed.js (same file as before) — this actually caused the crash. Go to server/seed.js on GitHub, edit, select all, delete, and paste this full updated version:

  Read 1 file

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');

function makeSimplePdf(title, lines) {
  const bodyLines = lines.map((l, i) => `(${l.replace(/[()\\]/g, '')}) Tj 0 -18 Td`).join('\n');
  const streamContent = `BT /F1 14 Tf 40 260 Td (${title.replace(/[()\\]/g, '')}) Tj 0 -26 Td /F1 10 Tf\n${bodyLines}\nET`;
  const objects = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/Resources<</Font<</F1 4 0 R>>>>/MediaBox[0 0 400 300]/Contents 5 0 R>>',
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
    `<</Length ${Buffer.byteLength(streamContent)}>>\nstream\n${streamContent}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj${obj}endobj\n`;
  });
  const xrefStart = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}

async function seedDatabase() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
  });

  console.log('Applying schema...');
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await conn.query(schema);

  console.log('Clearing existing demo data...');
  await conn.query('SET FOREIGN_KEY_CHECKS=0');
  for (const t of ['tasks', 'notes', 'interviews', 'testing_procedures', 'documents', 'findings', 'audit_team', 'audits', 'users', 'clients', 'organizations']) {
    await conn.query(`DELETE FROM ${t}`);
  }
  await conn.query('SET FOREIGN_KEY_CHECKS=1');

  const PASSWORD = 'Demo1234!';
  const hash = await bcrypt.hash(PASSWORD, 10);

  await conn.query(
    `INSERT INTO users (org_id, client_id, role, name, title, email, password_hash, initials) VALUES (NULL,NULL,'super_admin',?,?,?,?,?)`,
    ['Sandra Aitken', 'Super Admin', 'super@yuniveso.com', hash, 'SA']
  );

  const [orgRes] = await conn.query(
    `INSERT INTO organizations (name, industry, plan, mrr, status) VALUES (?,?,?,?,?)`,
    ['Beaumont Assurance Co.', 'Manufacturing', 'Enterprise', 21800, 'Active']
  );
  const orgId = orgRes.insertId;

  const [adminRes] = await conn.query(
    `INSERT INTO users (org_id, role, name, title, email, password_hash, initials) VALUES (?, 'admin', ?, 'Admin', ?, ?, ?)`,
    [orgId, 'Marcus Okoye', 'admin@yuniveso.com', hash, 'MO']
  );

  const auditorDefs = [
    ['Dana Castillo', 'Senior Auditor', 'dana@yuniveso.com', 'DC'],
    ['Rehan Nasser', 'Auditor', 'rehan@yuniveso.com', 'RN'],
    ['Tasha Liang', 'Auditor', 'tasha@yuniveso.com', 'TL'],
    ['Jonah Mbeki', 'Auditor', 'jonah@yuniveso.com', 'JM'],
  ];
  const auditorIds = {};
  for (const [name, title, email, initials] of auditorDefs) {
    const [r] = await conn.query(
      `INSERT INTO users (org_id, role, name, title, email, password_hash, initials) VALUES (?, 'auditor', ?, ?, ?, ?, ?)`,
      [orgId, name, title, email, hash, initials]
    );
    auditorIds[initials] = r.insertId;
  }

  const clientDefs = [
    ['Kesteven Manufacturing', 'Manufacturing', 'Elena Wren', 'elena@kesteven-demo.com'],
    ['Solent Health Group', 'Healthcare', 'Priya Shah', 'priya@solent-demo.com'],
    ['Fairholt Retail Ltd.', 'Retail', 'Omar Siddiqui', 'omar@fairholt-demo.com'],
    ['Norrmark Energy AB', 'Energy', 'Freya Lindqvist', 'freya@norrmark-demo.com'],
    ['Castellane Group', 'Financial services', 'Victor Hale', 'victor@castellane-demo.com'],
  ];
  const clientIds = {};
  for (const [name, industry, contact, email] of clientDefs) {
    const [r] = await conn.query(
      `INSERT INTO clients (org_id, name, industry, contact_name, contact_email) VALUES (?,?,?,?,?)`,
      [orgId, name, industry, contact, email]
    );
    clientIds[name] = r.insertId;
    const initials = contact.split(' ').map(s => s[0]).join('').toUpperCase();
    await conn.query(
      `INSERT INTO users (org_id, client_id, role, name, title, email, password_hash, initials) VALUES (?,?,'client',?, 'Finance Director', ?, ?, ?)`,
      [orgId, r.insertId, contact, email, hash, initials]
    );
  }

  const auditDefs = [
    { title: 'FY26 Financial Statement Audit', client: 'Kesteven Manufacturing', phase: 'Field Work', status: 'In Progress', risk: 'High', lead: 'DC', team: ['DC', 'RN'], progress: 58, target: '2026-10-03', scope: 'Full-scope statutory audit, FY2026' },
    { title: 'Internal Controls Review', client: 'Solent Health Group', phase: 'Reporting', status: 'Review Required', risk: 'High', lead: 'RN', team: ['RN'], progress: 82, target: '2026-09-26', scope: 'Controls walkthrough, FY2026' },
    { title: 'Compliance Audit', client: 'Fairholt Retail Ltd.', phase: 'Planning', status: 'Assigned', risk: 'Low', lead: 'TL', team: ['TL'], progress: 12, target: '2026-10-18', scope: 'Regulatory compliance review' },
    { title: 'Inventory Controls Review', client: 'Norrmark Energy AB', phase: 'Findings', status: 'In Progress', risk: 'High', lead: 'JM', team: ['JM'], progress: 71, target: '2026-09-29', scope: 'Inventory & warehouse controls' },
    { title: 'Tax Compliance Review', client: 'Castellane Group', phase: 'Reporting', status: 'Approved', risk: 'Medium', lead: 'DC', team: ['DC'], progress: 95, target: '2026-09-24', scope: 'Corporate tax compliance review' },
    { title: 'Q3 Internal Controls', client: 'Kesteven Manufacturing', phase: 'Reporting', status: 'Completed', risk: 'Low', lead: 'DC', team: ['DC'], progress: 100, target: '2026-09-10', scope: 'Quarterly controls testing' },
  ];
  const auditIds = {};
  let codeSeq = 142;
  for (const d of auditDefs) {
    const code = `AUD-2026-${String(codeSeq--).padStart(4, '0')}`;
    const [r] = await conn.query(
      `INSERT INTO audits (org_id, client_id, engagement_code, title, phase, status, risk_level, lead_auditor_id, start_date, target_date, progress_pct, scope_text)
       VALUES (?,?,?,?,?,?,?,?, '2026-08-18', ?, ?, ?)`,
      [orgId, clientIds[d.client], code, d.title, d.phase, d.status, d.risk, auditorIds[d.lead], d.target, d.progress, d.scope]
    );
    auditIds[d.title] = r.insertId;
    for (const initials of d.team) {
      await conn.query('INSERT INTO audit_team (audit_id, user_id) VALUES (?,?)', [r.insertId, auditorIds[initials]]);
    }
  }

  const fya = auditIds['FY26 Financial Statement Audit'];

  await conn.query(
    `INSERT INTO testing_procedures (audit_id, procedure_text, assertion, assigned_to, result) VALUES
     (?, 'Confirm bank balances with third parties', 'Existence', ?, 'No exceptions'),
     (?, 'Test revenue cut-off for Q4 shipments', 'Cut-off', ?, 'Exception noted'),
     (?, 'Recalculate depreciation on fixed assets', 'Accuracy', ?, 'No exceptions'),
     (?, 'Vouch a sample of AP invoices to source docs', 'Occurrence', ?, 'In progress')`,
    [fya, auditorIds.DC, fya, auditorIds.RN, fya, auditorIds.DC, fya, auditorIds.TL]
  );

  await conn.query(
    `INSERT INTO interviews (audit_id, topic, scheduled_date, auditor_id, status) VALUES
     (?, 'CFO — revenue recognition walkthrough', '2026-09-12', ?, 'Complete'),
     (?, 'Controller — payroll process', '2026-09-15', ?, 'Complete'),
     (?, 'Warehouse manager — inventory controls', '2026-09-25', ?, 'Scheduled')`,
    [fya, auditorIds.DC, fya, auditorIds.RN, fya, auditorIds.RN]
  );

  await conn.query(
    `INSERT INTO notes (audit_id, user_id, body) VALUES
     (?, ?, 'Cut-off exception on shipment #4471 — flagged for finding review. @Dana please confirm shipping date.'),
     (?, ?, 'Confirmed with client — shipment recorded one day early. Drafting finding now.')`,
    [fya, auditorIds.RN, fya, auditorIds.DC]
  );

  const findingDefs = [
    [fya, 'F-0142', 'Revenue recognized one day before shipment cut-off for Q4 orders', 'Critical', 'Revenue', 'RN', '2026-09-30', 'In Remediation'],
    [auditIds['Inventory Controls Review'], 'F-0131', 'Inventory count variance of 4.2% at northern warehouse site', 'High', 'Inventory', 'JM', '2026-10-08', 'Open'],
    [auditIds['Internal Controls Review'], 'F-0139', 'Segregation of duties gap in vendor payment approval workflow', 'Critical', 'Accounts Payable', 'TL', '2026-10-05', 'Open'],
    [fya, 'F-0137', 'Fixed asset register not reconciled to GL for 3 consecutive months', 'Critical', 'Fixed Assets', 'DC', '2026-10-12', 'In Remediation'],
    [auditIds['Q3 Internal Controls'], 'F-0119', 'Petty cash reconciliation discrepancy of $340 at regional office', 'Low', 'Treasury', 'DC', '2026-11-01', 'Resolved'],
  ];
  for (const [auditId, code, desc, risk, dept, lead, target, status] of findingDefs) {
    await conn.query(
      `INSERT INTO findings (org_id, audit_id, code, description, risk_level, department, responsible_id, target_date, status) VALUES (?,?,?,?,?,?,?,?,?)`,
      [orgId, auditId, code, desc, risk, dept, auditorIds[lead], target, status]
    );
  }

  const uploadsRoot = path.join(__dirname, '..', 'uploads', String(orgId), String(fya));
  await fs.promises.mkdir(uploadsRoot, { recursive: true });

  async function seedDoc({ auditId, category, requestedFrom, filename, status, dueDate, uploadedBy, pdfLines }) {
    if (status === 'Awaiting') {
      await conn.query(
        `INSERT INTO documents (org_id, audit_id, uploaded_by, category, requested_from, original_filename, stored_path, mime_type, size_bytes, status, due_date)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [orgId, auditId, uploadedBy || null, category, requestedFrom || '', filename, '', '', 0, status, dueDate || null]
      );
      return;
    }

    const dir = path.join(__dirname, '..', 'uploads', String(orgId), String(auditId));
    await fs.promises.mkdir(dir, { recursive: true });
    const storedName = `${Date.now()}-${Math.round(Math.random() * 1e9)}.pdf`;
    const fullPath = path.join(dir, storedName);
    fs.writeFileSync(fullPath, makeSimplePdf(filename, pdfLines || [filename]));
    const relPath = path.relative(path.join(__dirname, '..'), fullPath);
    const stat = fs.statSync(fullPath);
    await conn.query(
      `INSERT INTO documents (org_id, audit_id, uploaded_by, category, requested_from, original_filename, stored_path, mime_type, size_bytes, status, due_date)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [orgId, auditId, uploadedBy || null, category, requestedFrom || '', filename, relPath, 'application/pdf', stat.size, status, dueDate || null]
    );
  }

  await seedDoc({ auditId: fya, category: 'evidence', requestedFrom: 'Client', filename: 'Payroll Summary - August.pdf', status: 'Received', pdfLines: ['Demo placeholder document.', 'Category: Payroll evidence.'] });
  await seedDoc({ auditId: fya, category: 'evidence', requestedFrom: 'Client', filename: 'Vendor Contracts (top 20).pdf', status: 'Received', pdfLines: ['Demo placeholder document.', 'Category: Accounts payable evidence.'] });
  await seedDoc({ auditId: fya, category: 'bank_statement', requestedFrom: 'Dana Castillo', filename: 'Q3 Bank Reconciliation.pdf', status: 'Awaiting', dueDate: '2026-09-25' });
  await seedDoc({ auditId: fya, category: 'bank_statement', requestedFrom: 'Dana Castillo', filename: 'Fixed Asset Register.pdf', status: 'Awaiting', dueDate: '2026-09-28' });
  await seedDoc({ auditId: auditIds['Q3 Internal Controls'], category: 'report', filename: 'FY25 Final Audit Report.pdf', status: 'Approved', uploadedBy: adminRes.insertId, pdfLines: ['Demo placeholder final report.'] });
  await seedDoc({ auditId: auditIds['Q3 Internal Controls'], category: 'report', filename: 'FY25 Management Letter.pdf', status: 'Approved', uploadedBy: adminRes.insertId, pdfLines: ['Demo placeholder management letter.'] });

  await conn.query(
    `INSERT INTO tasks (org_id, audit_id, title, assigned_to, due_date, status) VALUES
     (?, ?, 'Field work sign-off', ?, '2026-09-28', 'Open'),
     (?, ?, 'Draft findings memo', ?, '2026-09-24', 'Overdue'),
     (?, NULL, 'Planning memo review', ?, '2026-10-10', 'Open')`,
    [orgId, fya, auditorIds.DC, orgId, auditIds['Inventory Controls Review'], auditorIds.JM, orgId, auditorIds.TL]
  );

  const [org2Res] = await conn.query(
    `INSERT INTO organizations (name, industry, plan, mrr, status) VALUES (?,?,?,?,?)`,
    ['Harrow & Finch LLP', 'Financial services', 'Enterprise', 14200, 'Active']
  );
  const org2Id = org2Res.insertId;
  await conn.query(
    `INSERT INTO users (org_id, role, name, title, email, password_hash, initials) VALUES (?, 'admin', 'Priya Anand', 'Admin', 'admin2@yuniveso.com', ?, 'PA')`,
    [org2Id, hash]
  );
  const [c2] = await conn.query(
    `INSERT INTO clients (org_id, name, industry, contact_name, contact_email) VALUES (?, 'Whitfield & Roe', 'Healthcare', 'Grace Lin', 'grace@whitfield-demo.com')`,
    [org2Id]
  );
  await conn.query(
    `INSERT INTO audits (org_id, client_id, engagement_code, title, phase, status, risk_level, start_date, target_date, progress_pct, scope_text)
     VALUES (?,?, 'AUD-2026-0201', 'Statutory Audit FY26', 'Planning', 'Assigned', 'Medium', '2026-09-01', '2026-11-15', 8, 'Statutory audit, first year of engagement')`,
    [org2Id, c2.insertId]
  );

  await conn.end();

  console.log('\nSeed complete.\n');
  console.log('Demo login password for every account below:', PASSWORD, '\n');
  console.log('  Super Admin : super@yuniveso.com');
  console.log('  Firm Admin  : admin@yuniveso.com     (Beaumont Assurance Co.)');
  console.log('  Auditor     : dana@yuniveso.com       (Senior Auditor)');
  console.log('  Auditor     : rehan@yuniveso.com');
  console.log('  Client      : elena@kesteven-demo.com (Kesteven Manufacturing)');
}

module.exports = seedDatabase;

if (require.main === module) {
  seedDatabase().catch((err) => { console.error(err); process.exit(1); });
}
