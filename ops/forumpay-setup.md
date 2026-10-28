# ForumPay provider setup

ForumPay replaces Segpay as the selected provider. The preview-only sandbox checkout uses secure, single-payment CreatePaymentLink orders and authenticated CheckPayment verification from the supplied OpenAPI 2.0.1 specification. Test credits are stored separately from production wallets and cannot buy content, fund calls, or be withdrawn. Creator payouts and production payments remain disabled. The production payment readiness guard stays false even if operator switches are changed.

## Complete the integration

1. Confirm the ForumPay merchant account, supported business model, currencies, settlement arrangement, refunds, and creator payout responsibilities for this marketplace. Obtain the account-specific integration documentation and test credentials.
2. Use the documented authentication, API endpoints, and notification verification method. Define server-only environment variables from the verified specification; do not reuse Segpay credentials or expose secrets in browser code.
3. Create checkout orders on the server with fixed catalog prices and an opaque order reference bound to the signed-in user. Verify final payment state, amount, currency, and order identity server-side before granting tokens.
4. Process repeated and out-of-order notifications idempotently. Commit payment receipts and append-only ledger credits together. Implement expiry, underpayment, refunds, reconciliation, and the approved payout process.
5. Test the full flow in a separate staging environment before replacing the hard-disabled readiness guard in src/lib/forumpay.ts and enabling operator switches.

## Removing Segpay

The Segpay helper and /api/webhooks/segpay receiver have been removed. Remove SEGPAY_PAYMENT_PAGE_URL, SEGPAY_POSTBACK_USERNAME, and SEGPAY_POSTBACK_PASSWORD from deployment configuration and disable the old notification destination in the Segpay account if it was configured. Set PAYMENT_PROVIDER=forumpay and keep PAYMENT_PROVIDER_APPROVED=false, PAYMENT_INTEGRATION_READY=false, and MARKETPLACE_LAUNCH_READY=false.

Migration 0006_segpay_postbacks.sql remains unchanged for existing database compatibility and historical records. Do not drop historical payment audit data as part of this provider change.

## Sandbox specification verified

The supplied OpenAPI API Manual version 2.0.1 defines the base URL as https://sandbox.api.forumpay.com/pay/v2/. The client is pinned to this sandbox host; production is not configured.

Set FORUMPAY_API_USERNAME and FORUMPAY_API_PASSWORD to the HTTP Basic API credentials generated in ForumPay API Settings, not your dashboard login. Set FORUMPAY_POS_ID to a point-of-service identifier (1–36 letters, digits, dots, underscores, or hyphens). Store credentials in deployment secrets.

StartPayment uses a form-encoded POST with pos_id, invoice_amount, invoice_currency, currency, payer_ip_address, and payer_id. A server-generated reference_no must identify the stored order. Display the returned network notices to the payer.

CheckPayment uses GET with pos_id, currency, payment_id, and address. Treat confirmed=true as confirmation only after comparing reference_no, invoice_amount, and invoice_currency against the stored order. Account settings can accept mismatched amounts; never credit the originally requested amount without comparing the actual result.

Payment webhooks contain JSON identifiers and no signature scheme is defined in this specification. Use a durable inbox and verify the current payment using CheckPayment with stored identifiers. Respond HTTP 200 after durable receipt; the provider documents a two-second connection timeout and up to five delivery attempts. Deduplicate ledger posting by stored payment ID and do not trust browser redirects or webhook fields as payment proof.

Live sandbox calls still require configured API credentials and network access to sandbox.api.forumpay.com.


## Running the sandbox checkout

1. Apply db/migrations/0007_forumpay_sandbox_checkout.sql after the preceding migrations to the Preview database. The migration creates isolated test orders, an immutable test-credit ledger, and a durable notification inbox. Do not share a production database for testing.
2. Configure the three ForumPay API variables and PAYMENT_PROVIDER=forumpay for Preview. Set FORUMPAY_SANDBOX_CHECKOUT_ENABLED=true only for Preview. VERCEL_ENV must be preview; production and local environments cannot enable this flow.
3. APP_URL must be the HTTPS origin of the intended preview. It is used for same-origin protection, payment redirects, and the payment-specific webhook URL. Authenticated GetTransactions polling supplies payment identifiers even when Vercel protection blocks callbacks. CheckPayment still validates the reference and amount before any test credit; deployment protection can remain enabled.
4. Deploy the tested branch as a Preview and sign in with an active, email-verified, age-verified client account. Open /sandbox/checkout. The package is £10 for 100 test tokens, matching the operator's chosen pricing.
5. Create an order and follow its explicit Open ForumPay test payment link. Use only ForumPay's documented sandbox payment simulation. Confirmation appears after a verified notification and status refresh. Closing checkout or returning from ForumPay never proves payment.
6. For reconciliation when the payer leaves, set a random 32+ character FORUMPAY_RECONCILIATION_SECRET and invoke POST /api/payments/reconcile periodically from a trusted scheduler with Authorization: Bearer <secret>. Keep this token server-side. Failed checks remain in the durable inbox for retry, up to 20 attempts; inspect unresolved receipts operationally.
7. Confirm one 100-token test credit, no spendable wallet credit, and no extra test credit on duplicate delivery. Test incorrect amounts, pending/cancelled payments, unknown references and API outages. A changed invoice amount goes to review and receives no credit. A checkout-creation timeout stays creating; inspect the provider before creating another order.

The sandbox build does not enable production payments. Real wallet funding, refund reversals, settlement reconciliation and creator payout operations still require their own completed implementation and acceptance testing. Test credits are never production entitlements.

## Automated verification

Run npm run test:payments (Node tests, mocked HTTP API and an actual in-process PostgreSQL engine via PGlite), npm run typecheck, npm run build, and npm run check:env-example. Tests cover immutable credit records, concurrent/repeated reconciliation, forged references, amount/currency mismatches, strict confirmation booleans, sandbox-host validation, provider errors, authorization, same-origin requests, and unsigned webhook persistence.


## Branch-scoped setup automation

The prebuild hook is inert unless its branch-specific flags are enabled. FORUMPAY_SANDBOX_VALIDATE_API=true runs read-only Ping and Me requests using Vercel's existing sandbox credentials, and verifies can_sell permission without printing credentials.

After creating a separate Neon branch/database, set a branch-specific Preview DATABASE_URL for codex/forumpay-sandbox-checkout. Only then set FORUMPAY_SANDBOX_DATABASE_ISOLATED=true and FORUMPAY_SANDBOX_MIGRATE=true for that branch. The prebuild hook applies migration 0007 atomically under a PostgreSQL advisory lock, verifies the three tables, and fails closed if prerequisites are absent. It refuses to run outside Preview or the checkout branch. After the successful rollout, turn FORUMPAY_SANDBOX_MIGRATE off.

Do not enable the isolation confirmation flag while Preview and Production share a database. The operator confirmed on 2026-10-28 that the existing Preview DATABASE_URL currently shares Production, so a separate Neon branch is required before migration.
