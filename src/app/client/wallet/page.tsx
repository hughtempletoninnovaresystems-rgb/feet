import PortalScreen from "@/components/PortalScreen";
import { getSessionUser } from "@/lib/auth";
import { forumPaySandboxEnabled } from "@/lib/forumpay";

export const dynamic = "force-dynamic";

export default async function ClientWallet() {
  const user = await getSessionUser();
  const eligible = user?.status === "active" && Boolean(user.email_verified_at) && Boolean(user.age_verified_at);
  return <PortalScreen role="client" section="wallet" sandboxCheckoutEnabled={forumPaySandboxEnabled() && eligible} />;
}
