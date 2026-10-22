import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: "My Feet Show — a little more personal",
  description: "Meet independent creators, discover their work, and connect on your terms.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Per-request headers make the shell dynamic so Proxy can nonce each Next.js script.
  await headers();
  return <html lang="en"><body>{children}</body></html>;
}
