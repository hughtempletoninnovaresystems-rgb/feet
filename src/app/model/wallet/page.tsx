import PortalScreen from "@/components/PortalScreen";
import { forumPaySandboxPayoutsEnabled } from "@/lib/forumpay";

export const dynamic = "force-dynamic";

export default function ModelWallet() {
  return <PortalScreen role="model" section="wallet" sandboxPayoutsEnabled={forumPaySandboxPayoutsEnabled()} />;
}
