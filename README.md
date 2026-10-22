# My Feet Show

My Feet Show is a pre-production, UK-focused adults-only creator marketplace prototype. It now has server-side email/password authentication and a Didit age-verification session flow. It is not production-ready: profile data and portal interactions are previews; payments, uploads, messaging, calls, and moderation are not connected. The current Stripe selection is blocked by Stripe's published adult-content policy, so the service cannot accept payments through Stripe unless Stripe grants explicit written approval or the operator selects another eligible provider.

## Current release gates

- `PUBLIC_SIGNUPS_ENABLED` must remain `false` in production until legal, privacy, safeguarding, and UK age-assurance reviews are complete and the Didit production account and age-assurance workflow are configured and verified. Production registration also fails closed unless the database, auth secret, email, Didit credentials/webhook secret, and non-draft legal version settings are present.
- `MARKETPLACE_LAUNCH_READY` must remain `false` in production. Client and creator portal routes return to a launch-gate page unless it is explicitly enabled after all launch gates are met and the same core production configuration is valid.
- Didit age checks are created and retrieved server-side. The app activates an account only after the matching Didit session returns `Approved` and includes age-estimation evidence; it stores the result state and timestamp, not images or the full provider response. Configure a published Didit Adaptive Age Verification workflow with an 18+ threshold, facial age estimation, a challenge-age approach, and ID verification fallback for borderline cases. The API key, workflow ID, destination webhook secret, and end-to-end provider review still need to be configured. See [Didit's API flow](https://docs.didit.me/integration/api-full-flow), [webhook guide](https://docs.didit.me/integration/webhooks), [age-estimation guide](https://docs.didit.me/core-technology/age-estimation/overview), and Ofcom's [age-assurance guidance](https://www.ofcom.org.uk/online-safety/protecting-children/age-assurance).
- Checkout and payouts are disabled. Stripe's current [published policy](https://stripe.com/legal/restricted-businesses) prohibits adult content and services and restricts content-creation platforms; do not configure or use Stripe for this product without written, product-specific approval. Select an eligible provider before enabling any real funds flow.
- The intended creator/company revenue split is 50/50. The calculation basis, payment costs, refunds, chargebacks, reserves, payout schedule, and taxes still need to be defined and published.
- Never publish paid content or accept real funds until the services, compliance work, and operational controls listed below are complete.

## Stack

- Next.js App Router + TypeScript
- Neon Postgres, with the initial schema in `db/schema.sql`
- Email/password authentication foundation using Node `scrypt`, Resend transactional email, opaque hashed sessions, and database-backed auth rate limits
- Planned integrations: private S3 media storage, an eligible payment and payout provider, Twilio Conversations and Video

OAuth buttons have been removed until their authorization and secure account-linking flows are implemented. Payment, S3, and Twilio packages are not currently wired into product routes.

## Local setup

Use Node.js 20.9 or newer.

1. Run `npm ci`.
2. Copy `.env.example` to `.env.local` and fill in `DATABASE_URL`, a 32+ character random `AUTH_SECRET`, `APP_URL`, and the Resend sender credentials. Configure `DIDIT_API_KEY` and `DIDIT_WORKFLOW_ID` from the Didit console for the intended environment. Set `DIDIT_WEBHOOK_SECRET` to the `secret_shared_key` for the webhook destination configured with `https://your-domain/api/webhooks/didit`.
3. On a fresh database, apply `db/schema.sql`, then apply each SQL file in `db/migrations/` in filename order. On an existing database, apply `0003_didit_age_verification.sql` after `0002_yoti_age_verification.sql`; it keeps legacy Yoti session rows for audit history and switches new sessions to Didit. Migration `0004_didit_webhook_events.sql` adds durable webhook event deduplication. Use a restricted server-only application database role. Do not expose database or provider credentials to browser code.
4. Run `npm run dev` and open `http://localhost:3000`.

The email registration flow creates pending accounts and sends verification links. After email verification, a user can sign in to a restricted session and start Didit adult eligibility verification. Only a server-confirmed `Approved` result for the matching session, including age-estimation evidence, activates the account. Local development can show the prototype portal after a verified active account is provisioned, but its warning banner identifies the data and actions as preview-only.

Useful commands:

```bash
npm run lint
npm run typecheck
npm run build
npm start
```

GitHub Actions checks that `.env.example` contains no credentials and keeps both release switches closed, then runs the production dependency audit, lint, type checking, and a production build on pushes and pull requests. There is not yet an automated behavior-test suite.

## Authentication foundation

- Passwords are stored using Node's `scrypt`; reset and email-verification tokens are random, single-use, short-lived, and stored only as hashes.
- Session cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` in production. Session tokens are opaque, hashed in Postgres, and expire after seven days.
- Mutating auth routes require a same-origin `Origin` header and validate their payloads. Auth attempts are limited in Postgres; the trusted deployment proxy must set `x-real-ip` correctly.
- Client and creator route layouts check the server-side session, role, active status, verified email, and verified adult eligibility. Didit sessions are tied to the signed-in user and provider session ID; result retrieval is rate limited and server-to-server.
- The Didit receiver at `/api/webhooks/didit` verifies the V2 canonical-body HMAC (or full raw-body HMAC fallback), then checks the signed body timestamp. For this app, subscribe to `status.updated`; other Didit event families can be added later, but the prototype has no entity or transaction product tables. Session status events update adult-verification state atomically with event-ID deduplication. Event payloads and identity evidence are not stored or logged.
- Password reset revokes existing sessions. Sign-in responses avoid confirming whether an email address exists.

This is a foundation, not a completed account-security review. OAuth, account linking, MFA, account recovery support, admin access, and security incident operations remain to be implemented as launch requirements dictate.

## Database

`db/schema.sql` defines the initial marketplace tables and token ledger. `db/migrations/0001_auth_foundation.sql` adds server sessions, email-verification tokens, auth rate limits, and immutable security audit records. `db/migrations/0002_yoti_age_verification.sql` is the historical age-verification baseline. `db/migrations/0003_didit_age_verification.sql` switches new sessions to Didit while retaining legacy Yoti rows. `db/migrations/0004_didit_webhook_events.sql` adds minimal webhook receipts for durable idempotency.

The SQL is not a complete production database deployment. Review constraints and permissions; create a least-privilege runtime role; ensure only server-side code can access auth, wallet, and verification tables; set up migration tracking and rollback practices; and rehearse backups and restores. The schema revokes public execution of the auth rate-limit and token-transfer functions. After creating the runtime role, grant it only the required table permissions and explicitly grant the needed function access, for example `GRANT EXECUTE ON FUNCTION public.consume_auth_rate_limit(text, integer, integer) TO mfs_app;` and `GRANT EXECUTE ON FUNCTION public.move_tokens(uuid, uuid, bigint, text, text, text, jsonb) TO mfs_app;`. Never accept balances, prices, role changes, or entitlements supplied by the browser.

`db/maintenance.sql` can be scheduled daily to remove expired sessions, one-time tokens, and rate-limit keys. Run it only after the operator finalizes retention requirements. Legal acceptances and security audit events are intentionally retained by this script.

## Work remaining before a marketplace launch

### Operator and compliance decisions

- Confirm the operating entity, jurisdiction, launch markets, privacy and safety contacts, and support/appeal process.
- Obtain jurisdiction-specific counsel review and replace every legal placeholder. Current pages are visibly marked as launch drafts.
- Complete Didit production onboarding, configure the Adaptive Age Verification workflow, and test every result and failure path. Have UK counsel/privacy specialists assess the age-assurance methods, Online Safety Act duties, data protection impact, biometric processing, notices, appeal flow, and retention. Ofcom's [age-assurance guidance](https://www.ofcom.org.uk/online-safety/protecting-children/age-assurance) describes the UK's highly effective age-assurance duties. The signup checkbox is only a declaration, not verification.
- Design creator/person-in-content consent and release checks, copyright/DMCA intake, prohibited-content review, urgent safety escalation, moderation staffing, and evidence retention.
- Replace Stripe with a provider that will support this exact adult content marketplace, or obtain explicit written approval from Stripe. Confirm UK marketplace, payout, money-transmission, consumer and tax treatment with the provider and qualified advisers before integration.
- Publish the intended 50/50 creator/company split and define the calculation basis, payment costs, minimum payout, payout timing, tax responsibilities, refunds, chargebacks, reserves, token expiry, call billing increment/rounding, and failed-call handling.

### Product services

- Replace hardcoded discovery/profile examples and all local-only interactions with database-backed reads and writes.
- Implement private media upload, server-side size/type checks, malware/content scanning, moderation, entitlement checks, short-lived signed access, and deletion/retention behavior.
- Implement purchases using server-calculated prices, signed and idempotent webhooks, append-only ledger transfers, refund/chargeback reversals, reconciliation, and an approved creator payout flow.
- Implement Twilio Conversations and Video with server-issued access tokens, block/age/role checks, broadcast admission and moderation, capacity controls, and verified session-time billing.
- Add an authenticated admin console for reports, content review, account restrictions, appeals, support, audit search, and payment disputes.
- Add durable report/block enforcement, spam and fraud controls, rate limits for public interactions, user export/deletion, notification delivery, and account closure workflows.

### Operations and quality

- Configure separate staging and production projects, production secrets, HTTPS domain settings, database connection limits, deployment approvals, rollback, and repeatable migrations.
- Add automated unit, integration, and end-to-end coverage for auth, role boundaries, adult gates, content entitlements, ledger concurrency, webhooks, refunds, and moderation controls.
- The final full npm audit reports five high-severity findings in the same development-only Next.js ESLint dependency chain (`braces`); the upstream advisory lists no patched version. The production dependency audit is clean, and CI now gates that production-only audit. Do not apply npm's suggested forced major downgrade; track the advisory and re-evaluate when upstream ships a fix.
- Add error tracking, structured logs without secrets or unnecessary sensitive data, service metrics and alerts, incident response, backup retention, and restore drills.
- Complete accessibility and responsive-device review. Test upload, billing, moderation, and account-recovery failure states.
- Review dependencies and security headers when OAuth, payment, media, and video integrations are selected. The current CSP allows the prototype's Google Fonts and Unsplash assets and only same-origin API connections; integrations will require a deliberate allowlist update.
- Production pages receive a per-request CSP nonce for Next.js scripts through the Next.js 16 proxy entrypoint. This keeps page HTML dynamic; review CSP origins whenever external integrations or assets are added.

## Production preview deployment

For a marketing-only preview, keep `PUBLIC_SIGNUPS_ENABLED=false` and `MARKETPLACE_LAUNCH_READY=false`, use production credentials only for the services the preview actually needs, and do not present the hardcoded prototype profiles as real creators. The portal gate is an operational safeguard; setting it to `true` is not a compliance or feature-completion check.
