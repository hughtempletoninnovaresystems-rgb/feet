import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "My Feet Show — a little more personal",
  description: "Meet independent creators, discover their work, and connect on your terms.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
