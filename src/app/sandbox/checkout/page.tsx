import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { forumPaySandboxEnabled } from "@/lib/forumpay";
import SandboxCheckout from "@/components/SandboxCheckout";

export const dynamic = "force-dynamic";
export default async function SandboxCheckoutPage() {
  if (!forumPaySandboxEnabled()) notFound();
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "client" || user.status !== "active" || !user.email_verified_at || !user.age_verified_at) redirect("/account-pending");
  return <main className="legal-page"><SandboxCheckout /></main>;
}
