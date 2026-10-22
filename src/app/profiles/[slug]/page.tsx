import ProfilePage from "@/components/ProfilePage";
import { notFound, redirect } from "next/navigation";
import { productionMarketplaceEnabled } from "@/lib/release-gates";

const previewSlugs = ["amelia-rose", "sofia-lane", "mia-sol", "ruby-ellis", "nina-june", "eva-luna", "jamierivers", "alexmorgan", "casey-lee", "taylor-grey"];

export default async function ProfileRoute({ params }: { params: Promise<{ slug: string }> }) {
  if (!productionMarketplaceEnabled()) redirect("/preview-only");
  const { slug } = await params;
  if (!previewSlugs.includes(slug)) notFound();
  return <ProfilePage slug={slug} />;
}
