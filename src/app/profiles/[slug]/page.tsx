import ProfilePage from "@/components/ProfilePage";
import { notFound, redirect } from "next/navigation";

const previewSlugs = ["amelia-rose", "sofia-lane", "mia-sol", "ruby-ellis", "nina-june", "eva-luna", "jamierivers", "alexmorgan", "casey-lee", "taylor-grey"];

export default async function ProfileRoute({ params }: { params: Promise<{ slug: string }> }) {
  if (process.env.NODE_ENV === "production" && process.env.MARKETPLACE_LAUNCH_READY !== "true") redirect("/preview-only");
  const { slug } = await params;
  if (!previewSlugs.includes(slug)) notFound();
  return <ProfilePage slug={slug} />;
}
