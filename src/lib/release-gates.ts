import "server-only";

import { getDiditCredentials } from "@/lib/didit";

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
  return process.env.MARKETPLACE_LAUNCH_READY === "true" && productionCoreConfigurationReady();
}
