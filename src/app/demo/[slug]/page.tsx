import { notFound } from "next/navigation";
import type { Metadata } from "next";
import DemoProfilePage from "@/components/DemoProfilePage";
import { demoProfiles, getDemoProfile } from "@/lib/demo-profiles";

export const metadata: Metadata = { title: "Demo profile | My Feet Show", robots: { index: false, follow: false } };

export function generateStaticParams() {
  return demoProfiles.map((profile) => ({ slug: profile.slug }));
}

export default async function DemoProfileRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const profile = getDemoProfile(slug);
  if (!profile) notFound();
  return <DemoProfilePage profile={profile} />;
}
