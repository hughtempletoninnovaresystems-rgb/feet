const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const { PGlite } = require("@electric-sql/pglite");

function load(file, mocks = {}, env = {}) {
  const compiled = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(source, {
    module: compiled, exports: compiled.exports,
    require: name => name === "server-only" ? {} : name in mocks ? mocks[name] : require(name),
    process: { env }, Error, SyntaxError, Buffer, URL, URLSearchParams, AbortSignal, Response, console,
    fetch: mocks.fetch ?? (() => { throw new Error("Unexpected network call"); }),
  }, { filename: file });
  return compiled.exports;
}
const validation = load("src/lib/forumpay-validation.ts");
const credentials = { PAYMENT_PROVIDER: "forumpay", FORUMPAY_API_USERNAME: "test", FORUMPAY_API_PASSWORD: "password", FORUMPAY_POS_ID: "WEB1", APP_URL: "https://checkout.example.com" };

test("exact prices, boolean confirmation, currency and reference are required", () => {
  const order = { id: "order", amount_pence: 1000 };
  const valid = { confirmed: true, reference_no: "order", invoice_currency: "GBP", invoice_amount: "10.00" };
  assert.equal(validation.verifiedPaymentMatches(valid, order), true);
  for (const patch of [{ confirmed: "true" }, { confirmed: false }, { cancelled: true }, { reference_no: "other" }, { invoice_currency: "USD" }, { invoice_amount: "9.99" }, { invoice_amount: "10.01" }, { invoice_amount: "1e1" }, { invoice_amount: 10 }]) {
    assert.equal(validation.verifiedPaymentMatches({ ...valid, ...patch }, order), false);
  }
  for (const amount of ["-10", "10.001", "Infinity", "", "1e1"]) assert.equal(validation.amountInPence(amount), null);
});

test("only the sandbox checkout host is accepted", () => {
  assert.equal(validation.sandboxPaymentUrl("https://sandbox.widget.forumpay.com/pay/order?a=1"), "https://sandbox.widget.forumpay.com/pay/order?a=1");
  for (const url of ["https://evil.test", "https://sandbox.widget.forumpay.com.evil.test", "http://sandbox.widget.forumpay.com", "https://user:pass@sandbox.widget.forumpay.com", "https://sandbox.widget.forumpay.com:444"]) {
    assert.throws(() => validation.sandboxPaymentUrl(url));
  }
});

test("provider calls use Basic auth, secure fixed-price links and stored identifiers", async () => {
  const calls = [];
  const api = load("src/lib/forumpay.ts", { fetch: async (url, options) => {
    calls.push({ url, options });
    return Response.json({ url: "https://sandbox.widget.forumpay.com/pay/order" });
  } }, credentials);
  await api.createForumPaySandboxLink({ id: "order", amountPence: 1000, payerId: "test-user" });
  const first = calls[0];
  assert.equal(first.url.href, "https://sandbox.api.forumpay.com/pay/v2/CreatePaymentLink/");
  assert.equal(first.options.method, "POST");
  assert.equal(first.options.headers.Authorization, "Basic " + Buffer.from("test:password").toString("base64"));
  assert.equal(new URLSearchParams(first.options.body).get("invoice_amount"), "10.00");
  assert.equal(new URLSearchParams(first.options.body).get("secure_link"), "true");
  assert.equal(new URLSearchParams(first.options.body).get("payer_id"), "test-user");
  assert.equal(new URLSearchParams(first.options.body).get("allow_multiple_payments"), "false");
  assert.equal(new URLSearchParams(first.options.body).get("auto_accept_underpayment"), "false");
  assert.equal(new URLSearchParams(first.options.body).get("webhook_url"), "https://checkout.example.com/api/webhooks/forumpay");
  await api.checkForumPaySandboxPayment({ paymentId: "stored-id", currency: "BTC", address: "stored-address" });
  assert.equal(calls[1].url.searchParams.get("payment_id"), "stored-id");
  assert.equal(calls[1].options.redirect, "error");
  assert.equal(api.forumPayIntegrationReady(), false);
  assert.equal(api.forumPaySandboxEnabled(), false);
});

test("production cannot enable sandbox, and API errors never expose provider payloads", async () => {
  const api = load("src/lib/forumpay.ts", { fetch: async () => Response.json({ err: "secret payload" }) },
    { ...credentials, VERCEL_ENV: "production", FORUMPAY_SANDBOX_CHECKOUT_ENABLED: "true" });
  assert.equal(api.forumPaySandboxEnabled(), false);
  await assert.rejects(api.checkForumPaySandboxPayment({ paymentId: "p", currency: "BTC", address: "a" }), /ForumPay rejected/);
});

test("database reconciliation credits exactly once and rejects forged or mismatched notices", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE users(id uuid PRIMARY KEY);
      CREATE FUNCTION prevent_token_ledger_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'immutable'; END $$;`);
    await db.exec(fs.readFileSync("db/migrations/0007_forumpay_sandbox_checkout.sql", "utf8"));
    // Migration can safely be run twice.
    await db.exec(fs.readFileSync("db/migrations/0007_forumpay_sandbox_checkout.sql", "utf8"));
    const user = "11111111-1111-4111-8111-111111111111";
    const order = "22222222-2222-4222-8222-222222222222";
    await db.query("INSERT INTO users VALUES ($1)", [user]);
    await db.query("INSERT INTO forumpay_sandbox_orders(id,user_id,request_key,package_id,amount_pence,tokens,state) VALUES ($1,$2,$1,'test-100',1000,100,'pending')", [order, user]);
    const sql = async (strings, ...values) => {
      const query = strings.reduce((text, fragment, i) => text + (i ? "$" + i : "") + fragment, "");
      return (await db.query(query, values)).rows;
    };
    let provider = { confirmed: true, reference_no: order, invoice_amount: "10.00", invoice_currency: "GBP" };
    const service = load("src/lib/forumpay-checkout.ts", {
      "@/lib/auth": {}, "@/lib/api": {},
      "@/lib/db": { getDb: () => sql, queryRows: rows => rows },
      "@/lib/forumpay": { findForumPaySandboxTransactions: async () => [], checkForumPaySandboxPayment: async () => provider },
      "@/lib/forumpay-validation": validation,
    });
    const insert = async id => db.query("INSERT INTO forumpay_sandbox_notifications(id,order_id,payment_id,currency,address) VALUES ($1,$2,'payment-1','BTC','address')", [id, order]);
    await insert("forged");
    provider = { ...provider, reference_no: "other" };
    await service.reconcileSandboxOrder(order);
    assert.equal((await db.query("SELECT * FROM forumpay_sandbox_credits")).rows.length, 0);
    await insert("underpaid");
    provider = { ...provider, reference_no: order, invoice_amount: "9.00" };
    await service.reconcileSandboxOrder(order);
    assert.equal((await db.query("SELECT * FROM forumpay_sandbox_credits")).rows.length, 0);
    provider = { ...provider, invoice_amount: "10.00", confirmed: false };
    await insert("pending");
    await service.reconcileSandboxOrder(order);
    assert.equal((await db.query("SELECT * FROM forumpay_sandbox_credits")).rows.length, 0);
    provider = { ...provider, confirmed: true };
    await Promise.all([service.reconcileSandboxOrder(order), service.reconcileSandboxOrder(order)]);
    await insert("duplicate");
    await service.reconcileSandboxOrder(order);
    const credits = (await db.query("SELECT * FROM forumpay_sandbox_credits")).rows;
    assert.equal(credits.length, 1);
    assert.equal(credits[0].tokens, 100);
    assert.equal((await db.query("SELECT state FROM forumpay_sandbox_orders")).rows[0].state, "confirmed");
    await assert.rejects(db.query("DELETE FROM forumpay_sandbox_credits"), /immutable/);
  } finally { await db.close(); }
});

test("checkout rejects unauthenticated users, forged prices and unknown packages before API calls", async () => {
  let response = { response: Response.json({ error: "Sign in" }, { status: 401 }) };
  let originValid = true;
  const route = load("src/app/api/payments/checkout/route.ts", {
    "@/lib/auth": { assertSameOrigin: () => { if (!originValid) throw new Error("Request origin could not be verified."); } },
    "@/lib/api": { jsonError: (error, status) => Response.json({ error }, { status }), readJson: r => r.json() },
    "@/lib/db": { getDb: () => { throw new Error("Database should not be called"); } },
    "@/lib/forumpay": {},
    "@/lib/forumpay-checkout": { sandboxBuyer: async () => response },
    "@/lib/forumpay-validation": validation,
  });
  const request = body => new Request("https://checkout.example.com/api/payments/checkout", { method: "POST", body: JSON.stringify(body) });
  assert.equal((await route.POST(request({}))).status, 401);
  response = { user: { id: "user" } };
  const key = "11111111-1111-4111-8111-111111111111";
  assert.equal((await route.POST(request({ packageId: "test-100", requestKey: key, amount: 1 }))).status, 400);
  assert.equal((await route.POST(request({ packageId: "free", requestKey: key }))).status, 400);
  originValid = false;
  assert.equal((await route.POST(request({ packageId: "test-100", requestKey: key }))).status, 403);
});

test("unsigned webhook durably enqueues without calling provider or issuing credits", async () => {
  let writes = 0;
  const route = load("src/app/api/webhooks/forumpay/route.ts", {
    "@/lib/api": { jsonError: (error, status) => Response.json({ error }, { status }), readJson: r => r.json() },
    "@/lib/db": { getDb: () => async () => { writes++; return []; } },
    "@/lib/forumpay": { forumPaySandboxEnabled: () => true, getForumPayConfiguration: () => ({ posId: "WEB1" }) },
  });
  const body = { reference_no: "11111111-1111-4111-8111-111111111111", payment_id: "p", pos_id: "WEB1", currency: "BTC", address: "a", confirmed: true };
  const request = data => new Request("https://checkout.example.com/api/webhooks/forumpay", { method: "POST", body: JSON.stringify(data) });
  assert.equal((await route.POST(request({ ...body, pos_id: "other" }))).status, 400);
  assert.equal(writes, 0);
  assert.equal((await route.POST(request(body))).status, 200);
  assert.equal(writes, 1);
});

test("payment status does not verify another user's order", async () => {
  let verified = false;
  const route = load("src/app/api/payments/orders/[orderId]/route.ts", {
    "@/lib/db": { getDb: () => async () => [], queryRows: r => r },
    "@/lib/api": { jsonError: (error, status) => Response.json({ error }, { status }) },
    "@/lib/forumpay-checkout": {
      sandboxBuyer: async () => ({ user: { id: "owner" } }),
      reconcileSandboxOrder: async () => { verified = true; },
    },
  });
  const response = await route.GET(new Request("https://checkout.example.com"), { params: Promise.resolve({ orderId: "11111111-1111-4111-8111-111111111111" }) });
  assert.equal(response.status, 404);
  assert.equal(verified, false);
});

test("transaction discovery uses the authenticated API with the stored order reference", async () => {
  let requested;
  const api = load("src/lib/forumpay.ts", { fetch: async url => {
    requested = url;
    return Response.json([{ payment_id: "p", currency: "BTC", address: "a" }]);
  } }, credentials);
  const rows = await api.findForumPaySandboxTransactions("stored-reference");
  assert.equal(requested.pathname, "/pay/v2/GetTransactions/");
  assert.equal(requested.searchParams.get("reference_no"), "stored-reference");
  assert.equal(requested.searchParams.get("pos_id"), "WEB1");
  assert.equal(rows[0].payment_id, "p");
});

test("migration and API validation refuse production even if setup flags are enabled", () => {
  const { spawnSync } = require("node:child_process");
  for (const file of ["migrate-forumpay-sandbox.mjs", "validate-forumpay-sandbox.mjs"]) {
    const result = spawnSync(process.execPath, ["scripts/" + file], {
      env: { ...process.env, VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "codex/forumpay-sandbox-checkout",
        FORUMPAY_SANDBOX_DATABASE_ISOLATED: "true", FORUMPAY_SANDBOX_MIGRATE: "true", FORUMPAY_SANDBOX_VALIDATE_API: "true" },
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Preview/);
  }
});

test("eligible sandbox buyers reach test checkout while production stays gated", async () => {
  let enabled = true;
  let user = { role: "client", status: "active", email_verified_at: "date", age_verified_at: "date" };
  const page = load("src/app/preview-only/page.tsx", {
    "next/link": { default: () => null },
    "next/navigation": { redirect: path => { throw new Error("redirect:" + path); } },
    "@/lib/auth": { getSessionUser: async () => user },
    "@/lib/forumpay": { forumPaySandboxEnabled: () => enabled },
  });
  await assert.rejects(page.default(), /redirect:\/sandbox\/checkout/);
  // Disabled production and ineligible visitors keep the marketplace gate.
  enabled = false;
  assert.ok(await page.default());
  enabled = true;
  user = { ...user, role: "model" };
  assert.ok(await page.default());
});
