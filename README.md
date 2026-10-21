# My Feet Show

A polished Next.js starter for an adults-only creator marketplace with separate client and model portals. The current UI is a front-end prototype with seeded demo data and local interaction states. It does not accept payments, send emails, store uploads, or connect video calls yet.

## Stack

- Next.js App Router + TypeScript, intended for Vercel
- Neon Postgres schema in `db/schema.sql`
- Private Amazon S3 media storage (short-lived signed URLs planned)
- Stripe Checkout for token purchases and Stripe Connect for model payouts
- Twilio Conversations for messaging, and Twilio Video for private calls and live broadcasts
- Google and Facebook OAuth plus email/password reset in the planned auth layer

## Local setup

Use Node.js 20.9 or newer. Install dependencies, copy `.env.example` to `.env.local`, fill in credentials as integrations are implemented, then run:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. You can navigate the public site, `/client`, `/model`, account screens, individual demo profiles, and legal documents without configuring provider credentials.

## Product routes

- `/` — public landing page and creator discovery preview
- `/client` — client discovery; `/client/content`, `/client/messages`, `/client/broadcasts`, `/client/wallet`, `/client/settings`
- `/model` — model dashboard and client discovery; `/model/media`, `/model/messages`, `/model/broadcasts`, `/model/wallet`, `/model/settings`
- `/profiles/[slug]` — public profile preview with likes, comments, follow, and block UI
- `/login`, `/register`, `/forgot-password` — account entry flows
- `/legal/terms`, `/legal/privacy`, `/legal/safety`, `/legal/tokens`, `/legal/cookies`, `/legal/creators` — initial product policy drafts

## Data model

`users` holds shared sign-in and account data. `client_profiles` and `model_profiles` are separate role-specific tables linked one-to-one to `users`. `wallets` plus the append-only `token_ledger` model token balance changes; use the `move_tokens` function inside trusted server-side transactions and verify Stripe webhooks before crediting a wallet. Never accept a balance supplied by the browser.

The schema includes content assets and purchases, conversations and messages, broadcasts and calls, profile likes and comments, blocks, reports, legal acceptances, and Stripe event idempotency. It is a starter schema, not yet a complete migration or production security policy.

## Payment-provider eligibility

Stripe is the requested provider, but its current rules list content-creation platforms selling exclusive digital content as restricted and adult content/services as prohibited. The product must receive Stripe's written eligibility decision for its exact content and live-call model before any Checkout or Connect integration is activated. The token cash-out flow also needs provider/legal review. Keep payment actions in demo mode until then.

## Integration plan

1. Add server-side session auth. Hash email passwords with a slow password-hashing function; use short-lived, hashed, single-use reset tokens. Configure Google and Facebook OAuth and prevent account-linking takeover. Require verified email and adult eligibility before restricted content access.
2. Add Neon connection handling and server-only data access. Enforce role checks at every server action/API route and in database access patterns; never trust a role or price sent by the client.
3. Add S3 presigned upload and download flows. Keep the bucket private, validate file size and MIME type server-side, scan/moderate files, store object keys rather than public URLs, and issue short-lived signed URLs only after checking an entitlement.
4. Add Stripe Checkout with server-calculated token packs, webhook signature verification, idempotent ledger entries, refund/chargeback handling, and Stripe Connect onboarding and payouts. The £1/token value is the intended gross conversion; creator share, platform fees, Stripe costs, minimum payout, tax and refund policy still need a commercial decision.
5. Create Twilio Conversations and mint chat access tokens on the server only. Mint Twilio Video access tokens on the server only. Create rooms, check block status and eligibility, charge by verified session time, and show the creator's per-minute rate plus the exact billing increment before join. For public broadcasts, add viewer admission, moderation and capacity controls.
6. Add rate limits, abuse/report workflows, content moderation, account recovery, audit logs, data export/deletion, provider webhooks, observability, backup and retention routines, and accessibility testing before launch.

## Launch decisions still required

- Legal operator identity, operating jurisdiction(s), privacy contact, support/safety contacts, and complaint/appeal process.
- Age/identity verification vendor and record-retention approach; the UI's age checkbox alone is not age verification.
- Model commission, payout minimums/timing, provider/FX fee treatment, refund and chargeback allocation, tax reporting and token expiry policy.
- Call billing granularity, rounding, minimum duration, connection-failure handling, and behavior on disconnect.
- Moderation and DMCA/copyright intake process, content-record retention, restricted-region and payment-provider eligibility.

All legal pages are launch drafts with explicit placeholders. They need review by counsel familiar with the operator's jurisdiction and the countries where members will be served. Do not accept real funds or publish monetised content until those details and the corresponding provider flows are complete.
