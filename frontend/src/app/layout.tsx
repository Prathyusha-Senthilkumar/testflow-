import type { Metadata } from "next";
import { RecoveryRedirect } from "@/components/RecoveryRedirect";
import "./globals.css";

export const metadata: Metadata = { title: "TestFlow", description: "Playwright Automation Platform" };

export default function RootLayout({children}:{children:React.ReactNode}){ return <html lang="en"><body><RecoveryRedirect />{children}</body></html>; }
