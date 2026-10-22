import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import ModerationQueue from "@/components/ModerationQueue";

export const dynamic = "force-dynamic";

export default async function ModerationPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "admin" || user.status !== "active" || !user.email_verified_at) redirect("/");
  return <ModerationQueue />;
}
