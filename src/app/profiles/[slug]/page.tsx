import ProfilePage from "@/components/ProfilePage";

export default async function ProfileRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ProfilePage slug={slug} />;
}
