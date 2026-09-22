# YUNIVESO — Audit & Compliance Platform

A working prototype: Node.js/Express backend, MySQL database, and the
original design pages wired up to real (seeded, fake) data.

## Roles

- **Super Admin** — platform-wide: every organization, every client, every audit.
- **Admin** — runs one firm: its clients, audits, employees, findings, reports.
- **Auditor** — only the audits they're assigned to (via the `audit_team` table).
- **Client** — only their own company's audits, documents, and reports. This is
  enforced on every API call, not just hidden in the UI — see `server/routes/api.js`'s
  `auditScope()` helper.

## Local development

1. Copy `.env.example` to `.env` and fill in your MySQL connection details.
2. `npm install`
3. `npm run seed` — creates the schema and fills it with demo data (prints
   login credentials at the end; the password for every seeded account is
   `Demo1234!`).
4. `npm start` — runs on `http://localhost:8080` (or `$PORT`).

## Deploying to Railway

1. Push this project to a GitHub repo.
2. On railway.app: **New Project → Deploy from GitHub repo**, pick this repo.
3. **+ New → Database → MySQL** in the same project.
4. On the web service, add environment variables from the MySQL service's
   "Variables" tab: `DB_HOST` (its private host), `DB_PORT`, `DB_USER`,
   `DB_PASSWORD`, `DB_NAME`. Add your own `JWT_SECRET` (a long random string).
5. Once deployed, run the seed script once against the production database —
   easiest way is Railway's web shell for the service, then `npm run seed`.

## What's real vs. what's a placeholder

Real: login (bcrypt-hashed passwords), role-based data scoping end-to-end,
file upload/download (bank statements, evidence, reports) stored on disk
with metadata in MySQL, findings register, audit workspace.

Still placeholder/decorative (visual only, not wired to real numbers):
the revenue chart and system-activity feed on the Super Admin page, the
client-industry donut and completion-trend chart, the risk heatmap, and
three of the four KPIs on Reports & Analytics (avg. days to close,
compliance score, on-time delivery) — those need data this schema doesn't
capture yet (actual close dates, a compliance scoring model). Flag which
of these you actually want made real and I'll wire them up next.

See `SECURITY.md` for what's covered at the app level vs. what's a hosting
decision (WAF, CrowdSec) for whenever this goes to production.
