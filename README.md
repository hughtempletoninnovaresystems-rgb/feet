# My Feet Show

For the current Preview implementation, verified sandbox results and next steps, read [Project handover](docs/PROJECT_HANDOVER.md).

My Feet Show is a pre-production, UK-focused creator marketplace. It has server-side email/password, Google, and Facebook authentication and a Didit age-verification flow, database-backed creator discovery and profile interactions, persistent profile settings, private S3 creator uploads held for review, an authenticated moderation queue, and server-relayed Twilio Conversations messages. It is not production-ready: purchases, payouts, paid media access, and video calls are disabled; malware/content scanning, appeals, evidence retention, and launch sign-offs remain incomplete. Stripe is not approved for this adult-services product.

## Current release gates

- `PUBLIC_SIGNUPS_ENABLED` must remain `false` in production until `LEGAL_SIGNOFF_COMPLETE=true`, `UK_AGE_ASSURANCE_SIGNED_OFF=true`, legal versions are final, and the Didit production account/workflow has passed provider review. Production registration also checks database, auth, email, and Didit configuration.
- `MARKETPLACE_LAUNCH_READY` must remain `false` in production. Portal routes and messaging APIs stay closed until legal/age assurance sign-off, `MODERATION_OPERATIONS_READY=true`, S3, Twilio Conversations and US1 Video credentials, written ForumPay approval for this exact UK marketplace, and a completed provider integration (`PAYMENT_INTEGRATION_READY=true`) are in place. These environment switches record operator sign-offs; setting them is not evidence that review happened.
- Didit age checks are created and retrieved server-side. The app activates an account only after the matching Didit session returns `Approved` and includes age-estimation evidence; it stores the result state and timestamp, not images or the full provider response. Configure a published Didit Adaptive Age Verification workflow with an 18+ threshold, facial age estimation, a challenge-age approach, and ID verification fallback for borderline cases. The API key, workflow ID, destination webhook secret, and end-to-end provider review still need to be configured. See [Didit's API flow](https://docs.didit.me/integration/api-full-flow), [webhook guide](https://docs.didit.me/integration/webhooks), [age-estimation guide](https://docs.didit.me/core-technology/age-estimation/overview), and Ofcom's [age-assurance guidance](https://www.ofcom.org.uk/online-safety/illegal-and-harmful-content/online-pornography).
- ForumPay is the selected payment provider. A preview-only sandbox checkout is implemented at /sandbox/checkout with secure payment links, verified notifications, and isolated test credits (£10 for 100 test tokens). Production checkout, wallet funding, and payouts remain disabled; keep payment and marketplace launch switches false. See [ForumPay setup](ops/forumpay-setup.md).
- Recommended starting revenue share: creators receive 80% and the company retains 20% of each paid-service transaction's eligible settled revenue. Eligible revenue excludes transaction taxes and reversed transaction principal from refunds or chargebacks. The company pays processor, payout, moderation, safety, and operating costs from its 20%; reserves remain pending until released or actually applied. The 80% creator share uses [Fanvue's published standard creator rate](https://legal.fanvue.com/creator-terms) as a market benchmark, not as proof that this product's cost base matches theirs. It is a proposed commercial policy, not a signed term, and needs provider pricing and UK legal/tax review before launch.
- Economics check: the proposed creator/company share is 80/20 before payment costs, payout fees, reserves, and operating costs. Obtain ForumPay's written commercial terms before finalizing pricing.
- Never publish paid content or accept real funds until the services, compliance work, and operational controls listed below are complete.

## Stack

- Next.js App Router + TypeScript
- Neon Postgres, with the initial schema in `db/schema.sql`
- Email/password and Google/Facebook authentication using Node `scrypt`, Resend verification email, server-side OAuth callbacks, opaque hashed sessions, and database-backed auth rate limits
- Integrations: private S3 uploads and Twilio Conversations are wired behind server routes; Twilio Video token issuance is limited to active funded database sessions, which the app cannot create until a payment and billing flow is approved.

Google and Facebook authorization-code sign-in now use server-side callbacks, signed short-lived state cookies, and provider identity records. New social accounts remain pending until the app's email verification and Didit adult eligibility steps are complete. Provider identities are not automatically linked by matching email addresses. Private S3 uploads, Twilio Conversations, a restricted Twilio Video client/token path are wired into server routes. Checkout, payouts, paid media access, token funding, and call funding remain disabled.

## Local setup

Use Node.js 20.9 or newer.

1. Run `npm ci`.
2. Copy `.env.example` to `.env.local` and fill in `DATABASE_URL`, a 32+ character random `AUTH_SECRET`, `APP_URL`, Google and Facebook OAuth credentials, and the Resend sender credentials. Register the exact callback URLs listed in [ops/auth-providers.md](ops/auth-providers.md). Configure `DIDIT_API_KEY` and `DIDIT_WORKFLOW_ID` from the Didit console for the intended environment. Set `DIDIT_WEBHOOK_SECRET` to the `secret_shared_key` for the webhook destination configured with `https://your-domain/api/webhooks/didit`. ForumPay setup is tracked in [ops/forumpay-setup.md](ops/forumpay-setup.md). Configure private S3 storage and Twilio credentials separately.
3. On a fresh database, apply `db/schema.sql`, then apply each SQL file in `db/migrations/` in filename order. On an existing database, apply migrations `0003_didit_age_verification.sql`, `0004_didit_webhook_events.sql`, `0005_marketplace_moderation.sql`, and `0006_segpay_postbacks.sql` after their predecessors. For sandbox checkout, also apply `0007_forumpay_sandbox_checkout.sql` to the Preview database. Migration 0005 adds upload and message delivery state, moderator review metadata, and backfills role profiles for existing accounts. Migration 0006 is retained for historical audit compatibility; the Segpay receiver has been removed. Use a restricted server-only application database role. Do not expose database or provider credentials to browser code.
4. Run `npm run dev` and open `http://localhost:3000`.

Email, Google, and Facebook registration create pending accounts, role profiles, and email verification links. A social identity is keyed by its provider subject and is not auto-linked to an existing account by email; use the original sign-in method for that account. After email verification, a user can sign in to a restricted session and start Didit adult eligibility verification. Only a server-confirmed `Approved` result for the matching session, including age-estimation evidence, activates the account. The portal reads approved creator profiles from Postgres. Comments remain pending until review; uploads are private and cannot be published until their files are uploaded and approved. Messages are rate limited, checked against blocks, sent server-side through Twilio Conversations, and stored with provider delivery state.

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

This is a foundation, not a completed account-security review. Provider-account linking, MFA, account recovery support, admin MFA, security incident operations, and notifications remain incomplete.

## Database

`db/schema.sql` defines the marketplace tables, token ledger, and generic payment event receipts. Migrations `0001`–`0004` add auth, historical Yoti/Didit age verification, and webhook receipts. `0005_marketplace_moderation.sql` adds moderation, storage-upload, and Twilio message delivery state plus role-profile backfill. `0006_segpay_postbacks.sql` preserves the historical Segpay audit schema; no active receiver writes to it.

The SQL is not a complete production database deployment. Review constraints and permissions; create a least-privilege runtime role; ensure only server-side code can access auth, wallet, and verification tables; set up migration tracking and rollback practices; and rehearse backups and restores. The schema revokes public execution of the auth rate-limit and token-transfer functions. After creating the runtime role, grant it only the required table permissions and explicitly grant the needed function access, for example `GRANT EXECUTE ON FUNCTION public.consume_auth_rate_limit(text, integer, integer) TO mfs_app;` and `GRANT EXECUTE ON FUNCTION public.move_tokens(uuid, uuid, bigint, text, text, text, jsonb) TO mfs_app;`. Never accept balances, prices, role changes, or entitlements supplied by the browser.

`db/maintenance.sql` can be scheduled daily to remove expired sessions, one-time tokens, and rate-limit keys. Run it only after the operator finalizes retention requirements. Legal acceptances and security audit events are intentionally retained by this script.

## Work remaining before a marketplace launch

### Operator and compliance decisions

- Confirm the operating entity, jurisdiction, launch markets, privacy and safety contacts, and support/appeal process.
- Obtain jurisdiction-specific counsel review and replace every legal placeholder. Current pages are visibly marked as launch drafts.
- Complete Didit production onboarding, configure the Adaptive Age Verification workflow, and test every result and failure path. Have UK counsel/privacy specialists assess the age-assurance methods, Online Safety Act duties, data protection impact, biometric processing, notices, appeal flow, and retention. Ofcom's [age-assurance guidance](https://www.ofcom.org.uk/online-safety/illegal-and-harmful-content/online-pornography) describes the UK's highly effective age-assurance duties. The signup checkbox is only a declaration, not verification.
- Design creator/person-in-content consent and release checks, copyright/DMCA intake, prohibited-content review, urgent safety escalation, moderation staffing, and evidence retention.
- Confirm ForumPay approval and commercial terms for this exact marketplace and funds flow. See [ForumPay setup](ops/forumpay-setup.md).
- Confirm and publish the proposed 80/20 creator/company split, define the eligible-revenue calculation, minimum payout, payout timing, tax responsibilities, refund/chargeback reversals, reserve timing, token expiry, call billing increment/rounding, and failed-call handling. Model the provider quote against the company's 20% share before launch; do not pass processor fees through to creator balances under this recommendation.

### Product services

- Discovery, profiles, likes, blocks, reports, pending comments, profile settings, creator upload drafts, moderator review decisions, and Twilio-relayed messages now read/write database-backed records. The portal no longer renders sample creator records.
- Add malware/content scanning, approved-media delivery entitlements, deletion/export flows, retention controls, and upload recovery/cleanup. The current upload path enforces an allowlist and size limits, confirms the stored object size/type, and keeps objects private pending moderator review; it does not scan files or serve paid media.
- Implement ForumPay checkout, authenticated payment verification, server-calculated prices, append-only ledger posting, reversals, reconciliation, and the approved creator payout flow.
- Implement Twilio Video room creation, broadcast admission/moderation, capacity limits, verified per-session billing, and session termination. The browser video client and token route are connected, but the token route only issues access for an already active and funded call; the app cannot yet create, fund, or bill a call.
- Expand the authenticated moderation queue with appeals, support cases, audit search, policy-specific escalation, and operational coverage. Reports and uploaded media can be reviewed now; moderation staffing and legal evidence-retention policy still need operator setup.
- Add durable report/block enforcement, spam and fraud controls, rate limits for public interactions, user export/deletion, notification delivery, and account closure workflows.

### Operations and quality

- Configure separate staging and production projects, production secrets, HTTPS domain settings, database connection limits, deployment approvals, rollback, and repeatable migrations.
- Add automated unit, integration, and end-to-end coverage for auth, role boundaries, adult gates, content entitlements, ledger concurrency, webhooks, refunds, and moderation controls.
- The final full npm audit reports five high-severity findings in the same development-only Next.js ESLint dependency chain (`braces`); the upstream advisory lists no patched version. The production dependency audit is clean, and CI now gates that production-only audit. Do not apply npm's suggested forced major downgrade; track the advisory and re-evaluate when upstream ships a fix.
- Add error tracking, structured logs without secrets or unnecessary sensitive data, service metrics and alerts, incident response, backup retention, and restore drills.
- Complete accessibility and responsive-device review. Test upload, billing, moderation, and account-recovery failure states.
- Set the S3 bucket CORS origin to the production `APP_URL`, allow only `PUT`, and allow the signed `Content-Type`, `Cache-Control`, and `x-amz-server-side-encryption` headers. Keep the bucket private and enable default encryption, versioning/backups as required, and lifecycle rules only after retention sign-off. The app CSP adds only the configured S3 endpoint for media uploads.
- `ops/s3-cors.example.json` is a starting S3 CORS configuration. Replace its example origin with the exact production `APP_URL` before applying it.
- Review provider configuration, callback handling, dependencies, and security headers before public OAuth access. Google Fonts and remaining landing-page Unsplash assets still use third-party origins.
- Production pages receive a per-request CSP nonce for Next.js scripts through the Next.js 16 proxy entrypoint. This keeps page HTML dynamic; review CSP origins whenever external integrations or assets are added.

## Production preview deployment

For a marketing-only preview, keep `PUBLIC_SIGNUPS_ENABLED=false` and `MARKETPLACE_LAUNCH_READY=false`. The portal gate is an operational safeguard; setting it to `true` is not a compliance or feature-completion check. Do not enable registration or advertise creator discovery until the operator has completed the documented setup and sign-offs.
