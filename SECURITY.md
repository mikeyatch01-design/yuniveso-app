# Security notes

## What's implemented in the app itself

- **Passwords**: hashed with bcrypt (never stored or logged in plain text).
- **Sessions**: a signed JWT in an httpOnly, sameSite cookie — not readable
  by page JavaScript (blunts XSS token theft) and not sent cross-site
  (blunts CSRF).
- **Access control**: every API route re-derives what a user may see from
  their role + org/client on the server, on every request — never trusts
  a client-supplied ID alone. A client requesting another company's audit
  ID gets a 404, not their data.
- **File uploads**: restricted to PDF/Excel/image mime types, 20MB cap,
  server-generated filenames (the original filename is never used as a
  path — blocks path traversal), stored outside the web root's direct
  reach (served only through the authenticated download route).
- **Rate limiting**: login is capped at 10 attempts per IP per 15 minutes;
  every route is capped at 120 requests per minute per IP as a backstop.
- **HTTP headers**: `helmet` sets the standard hardening headers (CSP
  baseline, no-sniff, frame-deny, etc.).
- **SQL injection**: every query uses parameterized placeholders (`?`),
  never string-concatenated user input.

## What a WAF / CrowdSec actually adds (and why it's not "in the code")

A Web Application Firewall and CrowdSec operate in front of the
application — inspecting traffic before it reaches this Node process —
so they're a hosting/infrastructure decision, not something written into
the app. Two practical options once this is ready for real traffic:

1. **Cloudflare in front of the domain** (easiest): free tier includes a
   WAF with managed rulesets (blocks common exploit patterns, SQLi/XSS
   probes, bad bots) plus DDoS mitigation, and it's the same kind of DNS
   setup used for the budgeting app's domain — no server config needed.
2. **CrowdSec on the server itself**: a lightweight agent that watches
   logs (Nginx/app logs), detects attack patterns (brute force, scanning,
   known bad IPs from its shared community blocklist), and blocks them
   via a "bouncer" — typically paired with Nginx as a reverse proxy in
   front of the Node app. This is worth adding once the app is deployed
   somewhere with a real Nginx layer (Railway's own edge doesn't expose
   the server for this directly; a VPS deployment would).

Recommendation for now: put Cloudflare in front of the Railway domain
once you're ready to point a real domain at this — it covers the bulk of
what a WAF is for with the least setup, and CrowdSec can be layered on
later if you move to your own VPS.
