# Private video and pay-per-minute implementation contract

Status: development specification; NOT permission to enable paid adult services.

## Commercial rules
- Creators choose their own GBP price per minute, stored in integer pence.
- Platform commission is fixed at 20%; creator allocation is 80% of eligible settled revenue, excluding applicable taxes, refunds and chargebacks.
- Lock the agreed rate and commission snapshot at session acceptance. Subsequent creator price edits affect only new sessions.
- Use precise integer arithmetic, rounding at final settlement, with a consistent documented remainder rule.

## Session lifecycle
requested -> accepted -> connecting -> active -> ending -> ended (or declined/expired/failed).
- Require verified adults, creator availability, explicit acceptance, sufficient reserved wallet funds and launch eligibility before connecting.
- Start billing only when both authenticated participants are connected and the session is active.
- Camera and microphone are independently toggleable for both participants; turning either off does not pause billable connected time.
- Only the two authorised users receive scoped Twilio room tokens; short expiry, no recording by default.
- Persist participant connection/disconnection events, heartbeat, start/end timestamps and provider room identifiers.
- Enforce wallet limits and session termination on the server, not in the browser.
- Warn before reserved funds run out; end access when the reserve is exhausted.
- Idempotent disconnect and settlement handlers must tolerate retries, reconnects and race conditions.

## Wallet and accounting
- Ledger entries are immutable, denominated in integer pence, with unique idempotency keys.
- Separate available, reserved and pending balances; prevent concurrent sessions spending the same funds.
- Top-ups become spendable only on verified, reconciled payment-provider settlement under its approved stored-value model.
- Authorise/reserve funds atomically before joining; settle by elapsed billable seconds at the locked per-minute rate.
- Refund unused reserve on completion; do not create funds from untrusted client or webhook events.
- Split eligible settled revenue 80/20; track refunds, chargebacks, processor fees, payout holds and reconciliations separately.
- Withdrawal requests require verified creator eligibility and provider-approved payouts.

## Safety and release blockers
- Keep PUBLIC_SIGNUPS_ENABLED, MARKETPLACE_LAUNCH_READY and PAYMENT_INTEGRATION_READY false until existing sign-offs are independently completed.
- Written Twilio approval for explicit paid one-to-one video and written Segpay underwriting approval are required.
- UK age assurance, identity checks, consent, reporting, blocking, moderation, incident response and retention policies must be operational.
- No production wallet credits, live billing or video access until integration and tests pass.

## Delivery phases
1. Database migration: creator rates, sessions, participants, wallet ledger/reservations, settlement records and payout requests.
2. Server API: rate editing, session request/accept/decline, wallet reservation, signed room tokens, webhook reconciliation, finalisation.
3. UI: creator rate settings, discovery price labels, customer wallet, call screen with independent AV toggles, countdown, warning and leave button.
4. Safety: reporting/blocking, audit events, abuse prevention and provider-specific release gates.
5. Tests: concurrency, idempotency, rounding, interrupted calls, reconnects, insufficient funds, declined sessions, refunds and commission split.
