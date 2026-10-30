import { randomUUID } from "node:crypto";
import { z } from "zod";
import { assertSameOrigin } from "@/lib/auth";
import { jsonError, readJson } from "@/lib/api";
import { getDb, queryRows } from "@/lib/db";
import { createForumPaySandboxLink } from "@/lib/forumpay";
import { sandboxBuyer } from "@/lib/forumpay-checkout";
import { sandboxPackages, sandboxPaymentUrl } from "@/lib/forumpay-validation";

export const runtime = "nodejs";
const schema = z.object({ packageId: z.string(), requestKey: z.string().uuid() }).strict();

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const auth = await sandboxBuyer(request);
    if ("response" in auth) return auth.response;
    const parsed = schema.safeParse(await readJson(request));
    if (!parsed.success) return jsonError("Choose a valid test package.", 400);
    const pack = sandboxPackages.find(p => p.id === parsed.data.packageId);
    if (!pack) return jsonError("Unknown test package.", 400);
    const sql = getDb();
    const id = randomUUID();
    const created = queryRows<{ id: string }>(await sql`
      INSERT INTO forumpay_sandbox_orders(id, user_id, request_key, package_id, amount_pence, tokens)
      VALUES (${id}, ${auth.user.id}, ${parsed.data.requestKey}, ${pack.id}, ${pack.pence}, ${pack.tokens})
      ON CONFLICT (user_id, request_key) DO NOTHING RETURNING id`);
    if (!created.length) {
      const existing = queryRows<{ id: string; package_id: string; checkout_url: string | null }>(await sql`
        SELECT id, package_id, checkout_url FROM forumpay_sandbox_orders
        WHERE user_id = ${auth.user.id} AND request_key = ${parsed.data.requestKey}`)[0];
      if (!existing || existing.package_id !== pack.id) return jsonError("Request key already used for another package.", 409);
      if (!existing.checkout_url) return jsonError("Checkout creation is pending or needs reconciliation. Do not retry payment.", 409);
      return Response.json({ orderId: existing.id, checkoutUrl: existing.checkout_url }, { headers: { "Cache-Control": "no-store" } });
    }
    // No automatic retry after an ambiguous provider timeout.
    const result = await createForumPaySandboxLink({ id, amountPence: pack.pence, payerId: auth.user.id });
    const checkoutUrl = sandboxPaymentUrl(result.url);
    await sql`UPDATE forumpay_sandbox_orders SET checkout_url = ${checkoutUrl}, state = 'pending', updated_at = now() WHERE id = ${id}`;
    return Response.json({ orderId: id, checkoutUrl }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && error.message === "Request origin could not be verified.") return jsonError(error.message, 403);
    if (error instanceof SyntaxError) return jsonError("Invalid request.", 400);
    return jsonError("Sandbox checkout could not be created. Check your recent orders before retrying.", 503);
  }
}

export async function GET(request: Request) {
  try {
    const auth = await sandboxBuyer(request);
    if ("response" in auth) return auth.response;
    const sql = getDb();
    const orders = await sql`SELECT id, package_id, amount_pence, tokens, state, checkout_url, created_at
      FROM forumpay_sandbox_orders WHERE user_id = ${auth.user.id} ORDER BY created_at DESC LIMIT 20`;
    const balance = queryRows<{ tokens: string }>(await sql`SELECT COALESCE(sum(tokens), 0)::text AS tokens
      FROM forumpay_sandbox_credits WHERE user_id = ${auth.user.id}`)[0]?.tokens ?? "0";
    return Response.json({ packages: sandboxPackages, orders, sandboxBalance: balance }, { headers: { "Cache-Control": "private, no-store" } });
  } catch { return jsonError("Sandbox wallet is unavailable.", 503); }
}
