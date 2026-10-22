import "server-only";

import { randomBytes } from "node:crypto";
import { getDb } from "@/lib/db";
import { sendTransactionalEmail } from "@/lib/email";
import { hashToken } from "@/lib/auth";

function makeActionUrl(path: string, token: string) {
  const base = process.env.APP_URL;
  if (!base) throw new Error("APP_URL is required for email links.");
  const url = new URL(path, base);
  url.searchParams.set("token", token);
  return url.toString();
}

export async function issueVerificationEmail(userId: string, email: string) {
  const token = randomBytes(32).toString("base64url");
  const sql = getDb();
  await sql`WITH invalidated AS (
              UPDATE email_verification_tokens SET used_at = now()
              WHERE user_id = ${userId} AND used_at IS NULL RETURNING token_hash
            )
            INSERT INTO email_verification_tokens(token_hash, user_id, expires_at)
            VALUES (${hashToken(token)}, ${userId}, now() + interval '1 hour')`;
  const link = makeActionUrl("/verify-email", token);
  await sendTransactionalEmail({
    to: email,
    subject: "Verify your My Feet Show email",
    text: `Use this one-time link within one hour to verify your email address:\n\n${link}\n\nIf you did not create this account, you can ignore this message.`,
  });
}

export async function issuePasswordResetEmail(userId: string, email: string) {
  const token = randomBytes(32).toString("base64url");
  const sql = getDb();
  await sql`WITH invalidated AS (
              UPDATE password_reset_tokens SET used_at = now()
              WHERE user_id = ${userId} AND used_at IS NULL RETURNING token_hash
            )
            INSERT INTO password_reset_tokens(token_hash, user_id, expires_at)
            VALUES (${hashToken(token)}, ${userId}, now() + interval '1 hour')`;
  const link = makeActionUrl("/reset-password", token);
  await sendTransactionalEmail({
    to: email,
    subject: "Reset your My Feet Show password",
    text: `Use this one-time link within one hour to choose a new password:\n\n${link}\n\nIf you did not request this change, you can ignore this message.`,
  });
}
