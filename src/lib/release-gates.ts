import "server-only";

import { getDiditCredentials } from "@/lib/didit";
import { getSegpayPaymentPageUrl, getSegpayWebhookCredentials } from "@/lib/segpay";

function hasFinalLegalVersion(value: string | undefined) {
  const version = value?.trim();
  return Boolean(version && !/^(draft|placeholder|todo)(?:[-_.:]|$)/i.test(version));
}

export function productionCoreConfigurationReady() {
  if (process.env.NODE_ENV !== "production") return true;
  return Boolean(
    process.env.DATABASE_URL?.trim() &&
      (process.env.AUTH_SECRET?.length ?? 0) >= 32 &&
      process.env.RESEND_API_KEY?.trim() &&
      process.env.EMAIL_FROM?.trim() &&
      process.env.DIDIT_WEBHOOK_SECRET?.trim() &&
      process.env.LEGAL_SIGNOFF_COMPLETE === "true" &&
      process.env.UK_AGE_ASSURANCE_SIGNED_OFF === "true" &&
      hasFinalLegalVersion(process.env.LEGAL_TERMS_VERSION) &&
      hasFinalLegalVersion(process.env.LEGAL_PRIVACY_VERSION) &&
      getDiditCredentials(),
  );
}

export function productionSignupsEnabled() {
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.PUBLIC_SIGNUPS_ENABLED === "true" && productionCoreConfigurationReady();
}

export function productionMarketplaceEnabled() {
  if (process.env.NODE_ENV !== "production") return true;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();
  const privateStorageReady = Boolean(process.env.AWS_REGION?.trim() && process.env.S3_BUCKET_NAME?.trim()) && Boolean(accessKeyId) === Boolean(secretAccessKey);
  const paymentReady = process.env.PAYMENT_PROVIDER_APPROVED === "true" && process.env.PAYMENT_INTEGRATION_READY === "true" && Boolean(getSegpayPaymentPageUrl()) && Boolean(getSegpayWebhookCredentials());
  const safetyReady = process.env.MODERATION_OPERATIONS_READY === "true" && process.env.CONTENT_SCANNING_READY === "true";
  const twilioReady = Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim() && process.env.TWILIO_API_KEY?.trim() &&
    process.env.TWILIO_API_SECRET?.trim() && process.env.TWILIO_CONVERSATIONS_SERVICE_SID?.trim() &&
    process.env.TWILIO_VIDEO_API_KEY_REGION?.trim().toLowerCase() === "us1",
  );
  return process.env.MARKETPLACE_LAUNCH_READY === "true" && productionCoreConfigurationReady() && privateStorageReady && paymentReady && safetyReady && twilioReady;
}
