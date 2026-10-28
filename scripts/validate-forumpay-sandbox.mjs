if (process.env.FORUMPAY_SANDBOX_VALIDATE_API !== "true") {
  console.log("ForumPay sandbox API validation not requested.");
} else {
  if (process.env.VERCEL_ENV !== "preview" || process.env.VERCEL_GIT_COMMIT_REF !== "codex/forumpay-sandbox-checkout") {
    throw new Error("Sandbox API validation is restricted to the checkout Preview branch.");
  }
  const username = process.env.FORUMPAY_API_USERNAME?.trim();
  const password = process.env.FORUMPAY_API_PASSWORD;
  const posId = process.env.FORUMPAY_POS_ID?.trim();
  if (!username || username.includes(":") || !password || !posId || !/^[A-Za-z0-9._-]{1,36}$/.test(posId)) {
    throw new Error("Configure valid ForumPay sandbox API credentials and point of service.");
  }
  const headers = { Authorization: "Basic " + Buffer.from(username + ":" + password).toString("base64"), Accept: "application/json" };
  async function call(endpoint, query = "") {
    const response = await fetch("https://sandbox.api.forumpay.com/pay/v2/" + endpoint + "/" + query, {
      headers, redirect: "error", signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error("ForumPay sandbox " + endpoint + " failed with HTTP " + response.status + ".");
    const data = await response.json();
    if (!data || typeof data !== "object" || Array.isArray(data) || "err" in data) {
      // Do not emit provider messages or credentials in build logs.
      const code = typeof data?.code === "string" && /^[A-Za-z]{1,40}$/.test(data.code) ? data.code : "invalidResponse";
      throw new Error("ForumPay sandbox " + endpoint + " rejected the request (" + code + ").");
    }
    return data;
  }
  if ((await call("Ping")).result !== "pong") throw new Error("Unexpected ForumPay sandbox Ping response.");
  const account = await call("Me");
  if (!Array.isArray(account.api?.permissions) || !account.api.permissions.includes("can_sell")) {
    throw new Error("ForumPay sandbox API key needs can_sell permission for checkout.");
  }
  console.log("ForumPay sandbox API authentication verified: Ping pong and can_sell permission confirmed.");
  console.log("ForumPay sandbox payout permission", { canWithdraw: account.api.permissions.includes("can_withdraw") });
  const transactionResponse = await fetch("https://sandbox.api.forumpay.com/pay/v2/GetTransactions/?reference_no=49cfba8b-97dd-486f-9502-d2bd94316612&limit=50", { headers, redirect: "error", signal: AbortSignal.timeout(10_000) });
  const transactions = await transactionResponse.json();
  console.log("ForumPay verification diagnostic", {
    status: transactionResponse.status, array: Array.isArray(transactions),
    fields: Object.keys(transactions ?? {}),
    code: typeof transactions.code === "string" ? transactions.code : null,
    rowFields: Array.isArray(transactions.invoices) && transactions.invoices.length ? Object.keys(transactions.invoices[0]) : null,
    posIds: Array.isArray(transactions.invoices) ? transactions.invoices.map(row => row.pos_id) : null,
  });
}
