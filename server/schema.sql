-- YUNIVESO — Audit & Compliance Platform
-- MySQL schema. Run once against a fresh database (see README for how).

CREATE TABLE IF NOT EXISTS organizations (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(200) NOT NULL,
  industry      VARCHAR(120) NOT NULL DEFAULT '',
  plan          ENUM('Trial','Professional','Enterprise') NOT NULL DEFAULT 'Trial',
  mrr           DECIMAL(12,2) NOT NULL DEFAULT 0,
  status        ENUM('Active','Trial','Payment due','Suspended') NOT NULL DEFAULT 'Trial',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS clients (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  org_id        INT NOT NULL,
  name          VARCHAR(200) NOT NULL,
  industry      VARCHAR(120) NOT NULL DEFAULT '',
  contact_name  VARCHAR(150) NOT NULL DEFAULT '',
  contact_email VARCHAR(190) NOT NULL DEFAULT '',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

-- role determines what a user can see:
--   super_admin — platform-wide, org_id/client_id are NULL
--   admin       — one org, scoped by org_id
--   auditor     — one org, scoped by org_id, further scoped to assigned audits via audit_team
--   client      — one org AND one client, scoped by client_id (their own company's data only)
CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  org_id        INT NULL,
  client_id     INT NULL,
  role          ENUM('super_admin','admin','auditor','client') NOT NULL,
  name          VARCHAR(150) NOT NULL,
  title         VARCHAR(120) NOT NULL DEFAULT '',
  email         VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  initials      VARCHAR(4) NOT NULL DEFAULT '',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audits (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  org_id          INT NOT NULL,
  client_id       INT NOT NULL,
  engagement_code VARCHAR(40) NOT NULL,
  title           VARCHAR(220) NOT NULL,
  phase           ENUM('Planning','Field Work','Findings','Reporting') NOT NULL DEFAULT 'Planning',
  status          ENUM('Assigned','Received','In Progress','Review Required','Approved','Completed') NOT NULL DEFAULT 'Assigned',
  risk_level      ENUM('Low','Medium','High') NOT NULL DEFAULT 'Medium',
  lead_auditor_id INT NULL,
  start_date      DATE NULL,
  target_date     DATE NULL,
  progress_pct    TINYINT NOT NULL DEFAULT 0,
  scope_text      VARCHAR(255) NOT NULL DEFAULT '',
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (lead_auditor_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Which auditors are on which engagement (an auditor only sees audits they're on).
CREATE TABLE IF NOT EXISTS audit_team (
  audit_id INT NOT NULL,
  user_id  INT NOT NULL,
  PRIMARY KEY (audit_id, user_id),
  FOREIGN KEY (audit_id) REFERENCES audits(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS findings (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  org_id            INT NOT NULL,
  audit_id          INT NOT NULL,
  code              VARCHAR(20) NOT NULL,
  description       VARCHAR(500) NOT NULL,
  risk_level        ENUM('Critical','High','Medium','Low') NOT NULL,
  department        VARCHAR(120) NOT NULL DEFAULT '',
  responsible_id    INT NULL,
  target_date       DATE NULL,
  status            ENUM('Open','In Remediation','Resolved','Overdue') NOT NULL DEFAULT 'Open',
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (audit_id) REFERENCES audits(id) ON DELETE CASCADE,
  FOREIGN KEY (responsible_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Every uploaded/published file — client bank statements, auditor evidence,
-- and final reports all live here, distinguished by `category`. This is the
-- "data store" for PDFs/Excel files; the actual bytes sit on disk under
-- /uploads/<org_id>/<audit_id>/, this table only holds metadata + the path.
CREATE TABLE IF NOT EXISTS documents (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  org_id            INT NOT NULL,
  audit_id          INT NOT NULL,
  uploaded_by       INT NULL,
  category          ENUM('bank_statement','evidence','report','other') NOT NULL DEFAULT 'other',
  requested_from    VARCHAR(150) NOT NULL DEFAULT '',
  original_filename VARCHAR(255) NOT NULL,
  stored_path       VARCHAR(500) NOT NULL,
  mime_type         VARCHAR(120) NOT NULL DEFAULT '',
  size_bytes        INT NOT NULL DEFAULT 0,
  status            ENUM('Awaiting','Received','In Review','Approved') NOT NULL DEFAULT 'Received',
  due_date          DATE NULL,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (audit_id) REFERENCES audits(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS testing_procedures (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  audit_id     INT NOT NULL,
  procedure_text VARCHAR(255) NOT NULL,
  assertion    VARCHAR(80) NOT NULL DEFAULT '',
  assigned_to  INT NULL,
  result       ENUM('No exceptions','Exception noted','In progress') NOT NULL DEFAULT 'In progress',
  FOREIGN KEY (audit_id) REFERENCES audits(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS interviews (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  audit_id       INT NOT NULL,
  topic          VARCHAR(200) NOT NULL,
  scheduled_date DATE NULL,
  auditor_id     INT NULL,
  status         ENUM('Scheduled','Complete') NOT NULL DEFAULT 'Scheduled',
  FOREIGN KEY (audit_id) REFERENCES audits(id) ON DELETE CASCADE,
  FOREIGN KEY (auditor_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS notes (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  audit_id   INT NOT NULL,
  user_id    INT NOT NULL,
  body       TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (audit_id) REFERENCES audits(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tasks (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  org_id      INT NOT NULL,
  audit_id    INT NULL,
  title       VARCHAR(220) NOT NULL,
  assigned_to INT NULL,
  due_date    DATE NULL,
  status      ENUM('Open','Overdue','Done') NOT NULL DEFAULT 'Open',
  FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (audit_id) REFERENCES audits(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
);
