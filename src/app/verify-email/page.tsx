import VerifyEmailClient from "@/components/VerifyEmailClient";

export const dynamic = "force-dynamic";

export default async function VerifyEmail({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const params = await searchParams;
  return <VerifyEmailClient token={params.token ?? ""} />;
}
