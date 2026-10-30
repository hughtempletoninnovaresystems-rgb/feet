import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { forumPaySandboxPayoutsEnabled } from "@/lib/forumpay";
import SandboxPayouts from "@/components/SandboxPayouts";

export const dynamic="force-dynamic";
export default async function SandboxPayoutPage() {
  if (!forumPaySandboxPayoutsEnabled()) notFound();
  const user=await getSessionUser();
  if (!user) redirect("/login");
  if (user.role!=="model" || user.status!=="active" || !user.age_verified_at || !user.email_verified_at) redirect("/account-pending");
  return <main className="legal-page"><SandboxPayouts/></main>;
}
