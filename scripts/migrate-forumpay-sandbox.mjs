import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";

if (process.env.FORUMPAY_SANDBOX_MIGRATE !== "true") {
  console.log("ForumPay sandbox migration not requested.");
} else {
  if (process.env.VERCEL_ENV !== "preview" ||
      process.env.VERCEL_GIT_COMMIT_REF !== "codex/forumpay-sandbox-checkout" ||
      process.env.FORUMPAY_SANDBOX_DATABASE_ISOLATED !== "true") {
    throw new Error("Sandbox migration requires the checkout Preview branch and a confirmed isolated database.");
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Preview DATABASE_URL is missing.");
  const sql = neon(url);
  const prerequisites = await sql`
    SELECT to_regclass('public.users') IS NOT NULL AS users_ready,
      to_regprocedure('public.prevent_token_ledger_mutation()') IS NOT NULL AS ledger_ready`;
  if (!prerequisites[0]?.users_ready || !prerequisites[0]?.ledger_ready) {
    throw new Error("Preview database is missing prerequisite schema. Apply the base schema and preceding migrations first.");
  }
  const migration = await readFile(new URL("../db/migrations/0007_forumpay_sandbox_checkout.sql", import.meta.url), "utf8");
  const statements = migration.split(";").map(s => s.trim()).filter(Boolean);
  await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(710007)`,
    ...statements.map(statement => sql.query(statement)),
  ]);
  const verified = await sql`SELECT
    to_regclass('public.forumpay_sandbox_orders') IS NOT NULL AS orders_ready,
    to_regclass('public.forumpay_sandbox_credits') IS NOT NULL AS credits_ready,
    to_regclass('public.forumpay_sandbox_notifications') IS NOT NULL AS inbox_ready`;
  if (!Object.values(verified[0]).every(Boolean)) throw new Error("Sandbox schema verification failed.");
  console.log("ForumPay sandbox migration 0007 committed and all three tables verified.");
}
