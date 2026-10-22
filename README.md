# My Feet Show

My Feet Show is a pre-production, UK-focused creator marketplace. It has server-side email/password authentication and a Didit age-verification flow, database-backed creator discovery and profile interactions, persistent profile settings, private S3 creator uploads held for review, an authenticated moderation queue, and server-relayed Twilio Conversations messages. It is not production-ready: purchases, payouts, paid media access, and video calls are disabled; malware/content scanning, appeals, evidence retention, and launch sign-offs remain incomplete. Stripe is not approved for this adult-services product.

## Current release gates

- `PUBLIC_SIGNUPS_ENABLED` must remain `false` in production until `LEGAL_SIGNOFF_COMPLETE=true`, `UK_AGE_ASSURANCE_SIGNED_OFF=true`, legal versions are final, and the Didit production account/workflow has passed provider review. Production registration also checks database, auth, email, and Didit configuration.
- `MARKETPLACE_LAUNCH_READY` must remain `false` in production. Portal routes and messaging APIs stay closed until legal/age assurance sign-off, `MODERATION_OPERATIONS_READY=true`, S3, Twilio Conversations and US1 Video credentials, an approved non-Stripe payment provider, and a completed provider integration (`PAYMENT_INTEGRATION_READY=true`) are in place. These environment switches record operator sign-offs; setting them is not evidence that review happened.
- Didit age checks are created and retrieved server-side. The app activates an account only after the matching Didit session returns `Approved` and includes age-estimation evidence; it stores the result state and timestamp, not images or the full provider response. Configure a published Didit Adaptive Age Verification workflow with an 18+ threshold, facial age estimation, a challenge-age approach, and ID verification fallback for borderline cases. The API key, workflow ID, destination webhook secret, and end-to-end provider review still need to be configured. See [Didit's API flow](https://docs.didit.me/integration/api-full-flow), [webhook guide](https://docs.didit.me/integration/webhooks), [age-estimation guide](https://docs.didit.me/core-technology/age-estimation/overview), and Ofcom's [age-assurance guidance](https://www.ofcom.org.uk/online-safety/illegal-and-harmful-content/online-pornography).
- Checkout, purchases, and payouts are disabled, and `PAYMENT_INTEGRATION_READY` must stay `false` because there is no payment adapter in the app. Stripe's current [published policy](https://stripe.com/legal/restricted-businesses) prohibits adult content and services and restricts content-creation platforms; do not configure or use Stripe for this product without written, product-specific approval. Provider candidates to underwrite the exact UK marketplace include [Segpay](https://segpay.com/) and [CCBill](https://ccbill.com/industries/adult-business); neither is approved for this business until it confirms the marketplace model, creator split, UK merchant entity, funds flow, refunds, and payouts in writing.
- Recommended starting revenue share: creators receive 80% and the company retains 20% of each paid-service transaction's eligible settled revenue. Eligible revenue excludes transaction taxes and reversed transaction principal from refunds or chargebacks. The company pays processor, payout, moderation, safety, and operating costs from its 20%; reserves remain pending until released or actually applied. The 80% creator share uses [Fanvue's published standard creator rate](https://legal.fanvue.com/creator-terms) as a market benchmark, not as proof that this product's cost base matches theirs. It is a proposed commercial policy, not a signed term, and needs provider pricing and UK legal/tax review before launch.
- Economics check (illustrative, not a processor quote): for each £100 of eligible settled revenue, the creator gets £80 and the company has £20 before costs. If direct payment costs are £10, £15, or £20 per £100, the company has £10, £5, or £0 left respectively before payout fees and operating costs. Segpay says fees vary by merchant model and volume, so obtain its actual written quote and check that the company's remaining share covers operating costs before enabling payments ([Segpay fee FAQ](https://segpay.com/csfaq/)).
- Never publish paid content or accept real funds until the services, compliance work, and operational controls listed below are complete.

## Stack

- Next.js App Router + TypeScript
- Neon Postgres, with the initial schema in `db/schema.sql`
- Email/password authentication foundation using Node `scrypt`, Resend transactional email, opaque hashed sessions, and database-backed auth rate limits
- Integrations: private S3 uploads and Twilio Conversations are wired behind server routes; Twilio Video token issuance is limited to active funded database sessions, which the app cannot create until a payment and billing flow is approved.

OAuth buttons have been removed until their authorization and secure account-linking flows are implemented. Private S3 uploads, Twilio Conversations, and a restricted Twilio Video client/token path are wired into server routes. There is no payment-provider adapter yet; checkout, payouts, paid media access, and call funding remain disabled.

## Local setup

Use Node.js 20.9 or newer.

1. Run `npm ci`.
2. Copy `.env.example` to `.env.local` and fill in `DATABASE_URL`, a 32+ character random `AUTH_SECRET`, `APP_URL`, and the Resend sender credentials. Configure `DIDIT_API_KEY` and `DIDIT_WORKFLOW_ID` from the Didit console for the intended environment. Set `DIDIT_WEBHOOK_SECRET` to the `secret_shared_key` for the webhook destination configured with `https://your-domain/api/webhooks/didit`. For staging uploads, configure a private S3 bucket and either its credential pair or an attached runtime role. Configure Twilio Conversations and Video with an API key created in the US1 region; video calls remain unavailable without an active funded call row.
3. On a fresh database, apply `db/schema.sql`, then apply each SQL file in `db/migrations/` in filename order. On an existing database, apply migrations `0003_didit_age_verification.sql`, `0004_didit_webhook_events.sql`, and `0005_marketplace_moderation.sql` after their predecessors. Migration 0005 adds upload and message delivery state, moderator review metadata, and backfills role profiles for existing accounts. Use a restricted server-only application database role. Do not expose database or provider credentials to browser code.
4. Run `npm run dev` and open `http://localhost:3000`.

The email registration flow creates pending accounts, role profiles, and verification links. After email verification, a user can sign in to a restricted session and start Didit adult eligibility verification. Only a server-confirmed `Approved` result for the matching session, including age-estimation evidence, activates the account. The portal reads approved creator profiles from Postgres. Comments remain pending until review; uploads are private and cannot be published until their files are uploaded and approved. Messages are rate limited, checked against blocks, sent server-side through Twilio Conversations, and stored with provider delivery state.

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

This is a foundation, not a completed account-security review. OAuth, account linking, MFA, account recovery support, admin MFA, security incident operations, and notifications remain incomplete.

## Database

`db/schema.sql` defines the marketplace tables and token ledger. Migrations `0001`–`0004` add auth, historical Yoti/Didit age verification, and webhook receipts. `0005_marketplace_moderation.sql` adds moderation, storage-upload, and Twilio message delivery state plus role-profile backfill.

The SQL is not a complete production database deployment. Review constraints and permissions; create a least-privilege runtime role; ensure only server-side code can access auth, wallet, and verification tables; set up migration tracking and rollback practices; and rehearse backups and restores. The schema revokes public execution of the auth rate-limit and token-transfer functions. After creating the runtime role, grant it only the required table permissions and explicitly grant the needed function access, for example `GRANT EXECUTE ON FUNCTION public.consume_auth_rate_limit(text, integer, integer) TO mfs_app;` and `GRANT EXECUTE ON FUNCTION public.move_tokens(uuid, uuid, bigint, text, text, text, jsonb) TO mfs_app;`. Never accept balances, prices, role changes, or entitlements supplied by the browser.

`db/maintenance.sql` can be scheduled daily to remove expired sessions, one-time tokens, and rate-limit keys. Run it only after the operator finalizes retention requirements. Legal acceptances and security audit events are intentionally retained by this script.

## Work remaining before a marketplace launch

### Operator and compliance decisions

- Confirm the operating entity, jurisdiction, launch markets, privacy and safety contacts, and support/appeal process.
- Obtain jurisdiction-specific counsel review and replace every legal placeholder. Current pages are visibly marked as launch drafts.
- Complete Didit production onboarding, configure the Adaptive Age Verification workflow, and test every result and failure path. Have UK counsel/privacy specialists assess the age-assurance methods, Online Safety Act duties, data protection impact, biometric processing, notices, appeal flow, and retention. Ofcom's [age-assurance guidance](https://www.ofcom.org.uk/online-safety/illegal-and-harmful-content/online-pornography) describes the UK's highly effective age-assurance duties. The signup checkbox is only a declaration, not verification.
- Design creator/person-in-content consent and release checks, copyright/DMCA intake, prohibited-content review, urgent safety escalation, moderation staffing, and evidence retention.
- Replace Stripe with a provider that will support this exact adult content marketplace, or obtain explicit written approval from Stripe. Confirm UK marketplace, payout, money-transmission, consumer and tax treatment with the provider and qualified advisers before integration.
- Confirm and publish the proposed 80/20 creator/company split, define the eligible-revenue calculation, minimum payout, payout timing, tax responsibilities, refund/chargeback reversals, reserve timing, token expiry, call billing increment/rounding, and failed-call handling. Model the provider quote against the company's 20% share before launch; do not pass processor fees through to creator balances under this recommendation.

### Product services

- Discovery, profiles, likes, blocks, reports, pending comments, profile settings, creator upload drafts, moderator review decisions, and Twilio-relayed messages now read/write database-backed records. The portal no longer renders sample creator records.
- Add malware/content scanning, approved-media delivery entitlements, deletion/export flows, retention controls, and upload recovery/cleanup. The current upload path enforces an allowlist and size limits, confirms the stored object size/type, and keeps objects private pending moderator review; it does not scan files or serve paid media.
- Implement purchases using server-calculated prices, signed and idempotent webhooks, append-only ledger transfers, refund/chargeback reversals, reconciliation, and an approved creator payout flow.
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
- Review dependencies and security headers when OAuth, payment, media, and video integrations are selected. Google Fonts and remaining landing-page Unsplash assets still use third-party origins.
- Production pages receive a per-request CSP nonce for Next.js scripts through the Next.js 16 proxy entrypoint. This keeps page HTML dynamic; review CSP origins whenever external integrations or assets are added.

## Production preview deployment

For a marketing-only preview, keep `PUBLIC_SIGNUPS_ENABLED=false` and `MARKETPLACE_LAUNCH_READY=false`. The portal gate is an operational safeguard; setting it to `true` is not a compliance or feature-completion check. Do not enable registration or advertise creator discovery until the operator has completed the documented setup and sign-offs.
