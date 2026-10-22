import AgeVerificationClient from "@/components/AgeVerificationClient";
import { requireAgeVerificationUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AgeVerification({ searchParams }: { searchParams: Promise<{ cancelled?: string }> }) {
  const user = await requireAgeVerificationUser();
  const params = await searchParams;
  return <AgeVerificationClient role={user.role} cancelled={params.cancelled === "1"} />;
}
