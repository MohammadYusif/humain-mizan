# Security

## Reporting a vulnerability

Please do not open a public issue. Use GitHub's private vulnerability reporting on this repository
(Security tab, "Report a vulnerability"), or contact the maintainer, @MohammadYusif, directly.
Include what you found, how to reproduce it, and what it exposes. You will get a reply within three
working days.

## How Mizan protects data

- **Sign-in**: passwords are stored only as scrypt hashes; sessions are HMAC-signed, HttpOnly,
  SameSite=Lax cookies, Secure over HTTPS, valid for 12 hours. Failed sign-ins are rate limited. A
  deployment sets `HACK_REQUIRE_AUTH=true`, so it refuses to start without accounts.
- **Who sees a contract**: each contract is labelled Public, Internal or Restricted before any model
  sees it. Restricted contracts never reach an external model, and with roles set they and their
  reviews open only for Legal, on every endpoint.
- **Untrusted contract text**: instructions inside a contract are treated as data; they are quoted and
  escalated, never followed. Outward messages need approval or an explicit auto-send policy.
- **Cost limits**: each run has a turn cap and a USD budget; `HACK_MAX_REVIEWS` caps model reviews on
  a shared deployment.
- **Secrets** live in `.env` locally and in the host's variables when deployed, never in the
  repository. The container runs as an unprivileged user.

## Supported versions

Only the latest commit on `main` is supported.
