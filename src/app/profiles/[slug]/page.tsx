import ProfilePage from "@/components/ProfilePage";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { productionMarketplaceEnabled } from "@/lib/release-gates";

export default async function ProfileRoute({ params }: { params: Promise<{ slug: string }> }) {
  if (!productionMarketplaceEnabled()) redirect("/preview-only");
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if ((user.role !== "client" && user.role !== "model") || user.status !== "active" || !user.email_verified_at || !user.age_verified_at) redirect("/account-pending");
  const { slug } = await params;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) notFound();
  return <ProfilePage slug={slug} />;
}
