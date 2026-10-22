import type { ReactNode } from "react";
import { requireRole } from "@/lib/auth";

export default async function ModelLayout({ children }: { children: ReactNode }) {
  await requireRole("model");
  return children;
}
