import { redirect } from "next/navigation";
import AgeVerificationClient from "@/components/AgeVerificationClient";
import { requireAgeVerificationUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AgeVerificationComplete({ searchParams }: { searchParams: Promise<{ verificationSessionId?: string }> }) {
  const user = await requireAgeVerificationUser();
  const params = await searchParams;
  if (!params.verificationSessionId) redirect("/age-verification");
  return <AgeVerificationClient role={user.role} sessionId={params.verificationSessionId} />;
}
