import { readFileSync } from "node:fs";

const path = new URL("../.env.example", import.meta.url);
const entries = new Map();
for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line || line.startsWith("#")) continue;
  const separator = line.indexOf("=");
  if (separator < 1) continue;
  const key = line.slice(0, separator).trim();
  const value = line.slice(separator + 1).trim();
  if (entries.has(key)) throw new Error(`Duplicate environment variable in .env.example: ${key}`);
  entries.set(key, value);
}

const blankVariables = [
  "DATABASE_URL",
  "AUTH_SECRET",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "FACEBOOK_APP_ID",
  "FACEBOOK_APP_SECRET",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "DIDIT_API_KEY",
  "DIDIT_WORKFLOW_ID",
  "DIDIT_WEBHOOK_SECRET",
  "SEGPAY_PAYMENT_PAGE_URL",
  "SEGPAY_POSTBACK_USERNAME",
  "SEGPAY_POSTBACK_PASSWORD",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "S3_BUCKET_NAME",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_API_KEY",
  "TWILIO_API_SECRET",
  "TWILIO_CONVERSATIONS_SERVICE_SID",
];

for (const key of blankVariables) {
  if (!entries.has(key)) throw new Error(`Missing environment variable from .env.example: ${key}`);
  if (entries.get(key) !== "") throw new Error(`Credentials and service values must stay blank in .env.example: ${key}`);
}

if (entries.get("PAYMENT_PROVIDER") !== "segpay") throw new Error("The selected payment provider must be Segpay.");
if (!/^v\d+\.\d+$/.test(entries.get("FACEBOOK_GRAPH_API_VERSION") ?? "")) throw new Error("FACEBOOK_GRAPH_API_VERSION must use the vNN.N format.");

for (const key of ["PUBLIC_SIGNUPS_ENABLED", "MARKETPLACE_LAUNCH_READY", "LEGAL_SIGNOFF_COMPLETE", "UK_AGE_ASSURANCE_SIGNED_OFF", "MODERATION_OPERATIONS_READY", "CONTENT_SCANNING_READY", "PAYMENT_PROVIDER_APPROVED", "PAYMENT_INTEGRATION_READY"]) {
  if (entries.get(key) !== "false") throw new Error(`Production launch switch must default to false in .env.example: ${key}`);
}

if (entries.get("TWILIO_VIDEO_API_KEY_REGION") !== "us1") throw new Error("Twilio Video API key region must be set to us1.");

console.log("Environment example is safe and launch-gated.");
