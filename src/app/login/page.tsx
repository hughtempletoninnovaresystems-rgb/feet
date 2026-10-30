import AuthScreen from "@/components/AuthScreen";

export default async function Login({ searchParams }: { searchParams: Promise<{ oauth?: string }> }) {
  const params = await searchParams;
  return <AuthScreen mode="login" initialOAuthMessage={params.oauth} />;
}
