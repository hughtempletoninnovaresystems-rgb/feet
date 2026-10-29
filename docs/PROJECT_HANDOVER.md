# Project handover — 29 October 2026

## Start here

My Feet Show is a pre-production Next.js creator marketplace. The current work replaces Segpay with ForumPay and tests payments and creator payouts in an isolated Preview environment. Production marketplace services remain gated. The user has asked to leave the pending sandbox payout alone for now and save this handover to conserve ChatGPT usage.

**Next recommended feature:** improve the creator wallet, showing synthetic earnings, available balance, reserved payouts, payout history and status. Then consider a separate sandbox paid-content flow. Existing checkout test tokens cannot currently purchase content or fund calls.

## Repository and deployment

- Repository: `hughtempletoninnovaresystems-rgb/feet`; workspace `/workspace/feet`.
- Branch: `codex/forumpay-sandbox-checkout`.
- Draft PR: https://github.com/hughtempletoninnovaresystems-rgb/feet/pull/9
- Preview: https://feet-git-codex-forumpay-a59852-hugh-templeton-projects-022054c7.vercel.app
- Remote implementation commit: `9e7532bb5d63faf28f5384e39cca5e4c80b94efd`.
- Local equivalent implementation commit: `10784e9`; metadata differs from remote. Do not force-push to reconcile the histories.
- Vercel project: `prj_Ls0Cxv6Ud2KkAj5ola7QjdzJCMSN`; team `team_eTkABjHsYs0AG9T4kLUGz2Rh`.
- Latest status-check deployment: `dpl_D1i1iRXZ43YM3mh22yPG4q3dUf3R`. Its prebuild reconciliation ran successfully; final READY state was not checked in the last session.

Use the connected Personal GitHub/Vercel accounts belonging to Hugh. Shell GitHub credentials previously used the unrelated `keep-intel-support` account and returned 403. Publish through the correct connector or repair authentication first. Prior connector publishing used GitHub create-tree/create-commit/update-ref with an expected parent SHA.

## Database isolation

- Neon project: `silent-rain-36624658` (`neon-cobalt-village`), under the Vercel organization named “jessie cade’s projects”.
- Sandbox branch: `br-spring-dust-zafrp5ut`, named `preview-forumpay-checkout`; database `neondb`.
- Production branch: `br-empty-breeze-za951jzt` — do not use for sandbox work.
- Preview originally shared Production's database. A dedicated branch was subsequently created and this Git branch's Preview DATABASE_URL was changed to its pooled connection.
- Migrations `0007`–`0010` were applied to the sandbox branch. Always pass explicit project and branch IDs to Neon tools.
- Never paste database URLs, API credentials, bypass secrets or session cookies into documentation/logs.

## What has been verified

### Checkout

- Package chosen by the user: **£10 for 100 tokens**.
- `/sandbox/checkout` creates a hosted ForumPay test payment link for an authenticated eligible client.
- A real provider sandbox payment was completed and verified server-side, granting exactly 100 isolated test tokens.
- Repeated reconciliation and webhook delivery did not grant additional tokens.
- Test tokens cannot fund real wallets, content purchases, calls or withdrawals.
- Verified order: `49cfba8b-97dd-486f-9502-d2bd94316612`; provider payment: `f482e432-5061-47af-a7b3-27b3947a5116`.

### Webhooks

- Durable receipt precedes HTTP 200; processing runs using Next.js `after`.
- No signature scheme is specified in the supplied API document. Webhooks only trigger authenticated provider verification; they do not prove payment.
- Scripted duplicate deliveries and a genuine merchant-dashboard resend reached the endpoint without duplicate credit.
- A genuine automatic provider retry was verified: initial HTTP 503, then HTTP 200 for the same event about **62 seconds later**, with no manual resend.
- Retry fixture order: `18a35432-d4df-47b0-9e6a-62e884420099`; cancelled, no credits. Failure fixture has expired and mutation triggers are disabled.
- Vercel Preview protection stays enabled. New callback URLs include a server-only automation bypass query value. A temporary alias protection override used for the older payment was revoked.

### Creator payouts

- `/sandbox/payouts` is available only to eligible sandbox model accounts.
- Synthetic creator `sandbox-creator@example.test` has an immutable **£8 synthetic earning**, illustrating an 80% share of £10. This is a fixture, not revenue from a sale. The commercial 80/20 split is proposed, not finalized.
- Preparation, strict provider-detail validation, cancellation and release of reserved earnings were tested successfully.
- Reservations serialize against the creator record; duplicate request keys cannot create a second payout or change its destination. Ambiguous errors retain the hold.
- Only `confirmed in blockchain` plus a transaction ID marks a payout paid. Scheduled or sent remains incomplete.

## Outstanding payout — do not create a replacement

- Local payout: `a19f6cf6-a5b9-44a4-821f-dadb66525f49`.
- Provider payout: `daf7c0d2-2c78-443b-9fb0-15c6e0f5bd5d`.
- Amount: £8; stored crypto amount `0.00013094 BTC`; fees use `fixed_in`.
- Recipient simulator address: `btc-5592b1fdb13442a9984d98d42e7007ec`.
- User funded merchant sandbox treasury with 0.001 simulated BTC. Initial confirmation failed with insufficient balance; a later retry of the **same payout** succeeded.
- Latest authoritative GetPayout result: overall **scheduled**, transaction **sent**.
- Transaction ID: `b81e5f34-05e4-423b-b000-fdbbb3e041b5`.
- Local state remains `scheduled`; final blockchain confirmation has **not** been verified. £8 remains reserved, with no duplicate payout created.
- Merchant simulator address: `btc-c234f5f8b6474e009ee4bda4be800dec`; last observed balance `0.00086906 BTC`.
- The user asked to leave this for now. When resuming payout verification, reconcile this existing ID; never infer completion from the balance deduction or transaction ID alone.

## Configuration and operational cautions

ForumPay requests are pinned to `https://sandbox.api.forumpay.com/pay/v2/`. API credentials use HTTP Basic and are stored in Vercel secrets, not dashboard-login credentials. The API key has `can_withdraw` permission. Production readiness remains hard-disabled in code.

Branch-specific Preview flags enabled:

- `FORUMPAY_SANDBOX_CHECKOUT_ENABLED=true`
- `FORUMPAY_SANDBOX_DATABASE_ISOLATED=true`
- `FORUMPAY_SANDBOX_PAYOUTS_ENABLED=true`

Keep production launch/payment approvals false. Existing environment configuration is not proof of legal, provider or operational approval.

All mutation test triggers were disabled after testing: payout smoke false, payout retry-confirm false, payout reconcile ID empty, checkout smoke false, webhook test false, retry-start false, retry-cancel ID empty, migration trigger false. API readiness validation remains enabled. Confirm current values before building because settings can change outside the repo.

**Prebuild scripts can make provider calls and database changes when opt-in flags are enabled.** Git pushes can auto-deploy, and an explicit deployment may create another simultaneous build. Never enable new-payout smoke merely to inspect an existing payout. Prefer authenticated read/reconciliation endpoints; otherwise use only the existing-payout reconcile mode with retry-confirm false, then clear its flag. Each deployment snapshots environment configuration.

Provider quirks already handled:

- CreatePaymentLink requires `payer_id` in practice.
- GetTransactions returns `{ invoices: [...] }`; hosted links use `pos_id: "widget"`.
- CheckPayment must match exact GBP amount, stored reference and strict `confirmed=true`.
- Payout validation matches provider ID, creator ID, reference, invoice amount/currency, destination, fee type and a positive crypto amount.

## Code map

- `ops/forumpay-setup.md`: integration and operational setup.
- `src/lib/forumpay.ts`: sandbox API client and enablement gates.
- `src/lib/forumpay-checkout.ts`, `forumpay-validation.ts`: checkout reconciliation and validation.
- `src/lib/forumpay-payouts.ts`, `forumpay-payout-validation.ts`: payout reconciliation and validation.
- `src/app/api/payments/`: checkout and reconciliation routes.
- `src/app/api/webhooks/forumpay/`: notification receiver and retry fixture.
- `src/app/api/payouts/sandbox/`: payout preparation, listing, confirmation and cancellation.
- `src/app/sandbox/`: standalone test checkout and payout pages.
- `db/migrations/0007_forumpay_sandbox_checkout.sql`: test orders, credits and inbox.
- `0008_forumpay_webhook_delivery.sql`: delivery audit fields.
- `0009_forumpay_retry_test.sql`: bounded retry fixtures and attempts.
- `0010_forumpay_sandbox_payouts.sql`: synthetic earnings and payout reservations.
- `scripts/test-forumpay.cjs`: payment/payout regression tests.
- `scripts/smoke-forumpay-payout.mjs`: opt-in real sandbox operations; inspect before running.

## Validation and remaining work

Last implementation checks: **15 payment tests passed**, TypeScript and focused lint passed. Full repository lint had nine pre-existing unrelated errors. This handover task does not rerun deployment or financial tests.

Useful commands: `npm run test:payments`, `npm run typecheck`, `npm run check:env-example`. Inspect prebuild flags before `npm run build`.

Remaining priorities:

1. Polish the creator wallet around the existing isolated payout API, including clear reserved/available balances and meaningful pending/error states.
2. Verify the existing payout's final status when the user resumes testing; record confirmation only after authoritative provider evidence.
3. Remove or simplify temporary diagnostics and move operator tests out of prebuild where practical.
4. Test payout UI end to end and cover explicit rejection, timeout, cancellation and concurrent actions. Do not describe API smoke tests as full browser acceptance.
5. Build sandbox paid-content purchases and earnings attribution as separate work; current £8 is synthetic.
6. Complete production refund/reversal accounting, settlement reconciliation, real creator earnings policy, payout operations and launch gates before enabling real money.

Authentication, Didit age assurance, private S3 uploads, moderation and Twilio services exist elsewhere in the project but remain subject to incomplete configuration/review and release gates. This handover does not certify them as production-ready. Test account eligibility is synthetic; never copy that bypass into production. Test-account passwords are intentionally omitted; recover securely or reset only the isolated fixture if needed.

## Suggested prompt for the next chat

“Read docs/PROJECT_HANDOVER.md and ops/forumpay-setup.md in /workspace/feet. Continue on codex/forumpay-sandbox-checkout. Improve the sandbox creator wallet using the existing payout API. Keep Production disabled, preserve database isolation, and do not create another payout to replace the existing pending one. Keep responses concise to conserve usage.”
