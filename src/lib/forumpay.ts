import "server-only";

const sandboxApi = "https://sandbox.api.forumpay.com/pay/v2/";

export function getForumPayConfiguration() {
  if (process.env.PAYMENT_PROVIDER?.trim().toLowerCase() !== "forumpay") return null;
  const username = process.env.FORUMPAY_API_USERNAME?.trim();
  const password = process.env.FORUMPAY_API_PASSWORD;
  const posId = process.env.FORUMPAY_POS_ID?.trim();
  if (!username || username.includes(":") || !password || !posId || !/^[A-Za-z0-9._-]{1,36}$/.test(posId)) return null;
  return { username, password, posId };
}

async function requestForumPay(endpoint: "StartPayment" | "CheckPayment" | "CreatePaymentLink" | "Ping" | "GetTransactions", method: "GET" | "POST", fields: Record<string, string>): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  const config = getForumPayConfiguration();
  if (!config) throw new Error("ForumPay sandbox credentials are not configured.");
  const params = new URLSearchParams({ ...(endpoint === "GetTransactions" ? {} : { pos_id: config.posId }), ...fields });
  const url = new URL(endpoint + "/", sandboxApi);
  if (method === "GET") url.search = params.toString();
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: "Basic " + Buffer.from(config.username + ":" + config.password).toString("base64"),
      Accept: "application/json",
      ...(method === "POST" ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    ...(method === "POST" ? { body: params.toString() } : {}),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("ForumPay API request failed.");
  const data: unknown = await response.json();
  if (!data || typeof data !== "object") throw new Error("Invalid ForumPay API response.");
  if (Array.isArray(data)) {
    if (endpoint !== "GetTransactions" || data.some(row => !row || typeof row !== "object" || Array.isArray(row))) throw new Error("Invalid ForumPay API response.");
    return data as Record<string, unknown>[];
  }
  const result = data as Record<string, unknown>;
  // Provider errors may contain sensitive context; do not relay the raw response.
  if ("err" in result) throw new Error("ForumPay rejected the API request.");
  return result;
}

export type ForumPayOrder = {
  reference: string;
  invoiceAmount: string;
  invoiceCurrency: string;
  cryptoCurrency: string;
  payerId: string;
  payerIpAddress: string;
};

// Call only with a persisted, server-priced order and an authenticated payer.
export async function startForumPaySandboxPayment(order: ForumPayOrder) {
  if (!order.reference || !/^[0-9]+\.[0-9]{2}$/.test(order.invoiceAmount) || Number(order.invoiceAmount) <= 0 ||
      !/^[A-Z]{3}$/.test(order.invoiceCurrency) || !/^[A-Z0-9_]{1,40}$/.test(order.cryptoCurrency) ||
      !/^[A-Za-z0-9._-]{1,64}$/.test(order.payerId) || !order.payerIpAddress) {
    throw new Error("Invalid ForumPay order.");
  }
  return requestForumPay("StartPayment", "POST", {
    reference_no: order.reference,
    invoice_amount: order.invoiceAmount,
    invoice_currency: order.invoiceCurrency,
    currency: order.cryptoCurrency,
    payer_id: order.payerId,
    payer_ip_address: order.payerIpAddress,
    accept_zero_confirmations: "false",
  });
}

// Use identifiers from the persisted order, never blindly from a webhook.
export async function checkForumPaySandboxPayment(payment: { paymentId: string; currency: string; address: string }) {
  if (!payment.paymentId || !payment.currency || !payment.address) throw new Error("Missing ForumPay payment identifiers.");
  const result = await requestForumPay("CheckPayment", "GET", {
    pos_id: "widget",
    payment_id: payment.paymentId,
    currency: payment.currency,
    address: payment.address,
  });
  if (Array.isArray(result)) throw new Error("Invalid ForumPay payment response.");
  return result;
}

// Credentials and operator switches do not establish integration readiness.
// Checkout, verified receipts, idempotent ledger posting, refunds,
// reconciliation, and the approved payout flow must be completed first.
export function forumPayIntegrationReady(): boolean {
  return false;
}


export function forumPaySandboxEnabled() {
  return process.env.VERCEL_ENV === "preview" &&
    process.env.FORUMPAY_SANDBOX_CHECKOUT_ENABLED === "true" &&
    Boolean(getForumPayConfiguration());
}

export async function createForumPaySandboxLink(order: { id: string; amountPence: number; payerId: string }) {
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(order.payerId)) throw new Error("Invalid sandbox payer.");
  const origin = new URL(process.env.APP_URL ?? "");
  if (origin.protocol !== "https:" || origin.username || origin.password) throw new Error("Configure a secure sandbox APP_URL.");
  const webhook = new URL("/api/webhooks/forumpay", origin);
  const bypass = process.env.FORUMPAY_WEBHOOK_BYPASS_SECRET;
  if (process.env.VERCEL_ENV === "preview" && bypass) webhook.searchParams.set("x-vercel-protection-bypass", bypass);
  const result = await requestForumPay("CreatePaymentLink", "POST", {
    webhook_url: webhook.href,
    redirect_url_on_success: new URL("/sandbox/checkout", origin).href,
    redirect_url_on_failure: new URL("/sandbox/checkout", origin).href,
    invoice_amount: (order.amountPence / 100).toFixed(2),
    invoice_currency: "GBP",
    widget_type: "0",
    reference_no: order.id,
    payer_id: order.payerId,
    secure_link: "true",
    allow_multiple_payments: "false",
    accept_zero_confirmations: "false",
    auto_accept_underpayment: "false",
    auto_accept_overpayment: "false",
    auto_accept_late_payment: "false",
    auto_accept_other_currency: "false",
  });
  if (Array.isArray(result)) throw new Error("Invalid ForumPay checkout response.");
  return result;
}


export async function findForumPaySandboxTransactions(reference: string) {
  const result = await requestForumPay("GetTransactions", "GET", { reference_no: reference, limit: "50" });
  const rows = Array.isArray(result) ? result : result.invoices;
  if (!Array.isArray(rows) || rows.some(row => !row || typeof row !== "object" || Array.isArray(row))) {
    throw new Error("Invalid ForumPay transaction list.");
  }
  return rows as Record<string, unknown>[];
}

export function forumPaySandboxPayoutsEnabled() {
  return forumPaySandboxEnabled() && process.env.FORUMPAY_SANDBOX_DATABASE_ISOLATED === "true" &&
    process.env.FORUMPAY_SANDBOX_PAYOUTS_ENABLED === "true";
}

export async function forumPayPayoutRequest(
  endpoint: "StartPayout" | "GetPayout" | "ConfirmPayout" | "CancelPayout",
  fields: Record<string, string>,
): Promise<Record<string, unknown>> {
  if (!forumPaySandboxPayoutsEnabled()) throw new Error("Sandbox payouts unavailable.");
  const config = getForumPayConfiguration()!;
  const url = new URL(endpoint + "/", sandboxApi);
  url.search = new URLSearchParams(fields).toString();
  const response = await fetch(url, {
    headers: { Authorization: "Basic " + Buffer.from(config.username + ":" + config.password).toString("base64"), Accept: "application/json" },
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    console.error("Sandbox payout API failed", { endpoint, status: response.status });
    throw new Error("ForumPay sandbox payout request failed.");
  }
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid payout response.");
  const result = data as Record<string, unknown>;
  if ("err" in result) {
    const code = typeof result.code === "string" && /^[A-Za-z]{1,40}$/.test(result.code) ? result.code : "unspecified";
    console.error("Sandbox payout rejected", { endpoint, code });
    throw new Error("ForumPay rejected the sandbox payout request.");
  }
  return result;
}
