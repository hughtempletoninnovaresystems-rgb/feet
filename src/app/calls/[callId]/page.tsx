import { notFound, redirect } from "next/navigation";
import FundedVideoRoom from "@/components/FundedVideoRoom";
import { getSessionUser } from "@/lib/auth";
import { productionMarketplaceEnabled } from "@/lib/release-gates";

export const dynamic = "force-dynamic";

export default async function CallPage({ params }: { params: Promise<{ callId: string }> }) {
  if (!productionMarketplaceEnabled()) redirect("/preview-only");
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if ((user.role !== "client" && user.role !== "model") || user.status !== "active" || !user.email_verified_at || !user.age_verified_at) redirect("/account-pending");
  const { callId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(callId)) notFound();
  return <FundedVideoRoom callId={callId} />;
}
