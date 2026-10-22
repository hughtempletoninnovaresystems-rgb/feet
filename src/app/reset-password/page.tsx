import AuthScreen from "@/components/AuthScreen";

export const dynamic = "force-dynamic";

export default async function ResetPassword({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const params = await searchParams;
  return <AuthScreen mode="reset" initialToken={params.token ?? ""} />;
}
