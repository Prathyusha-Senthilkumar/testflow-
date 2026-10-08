import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { RecoveryRedirect } from "@/components/RecoveryRedirect";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Attest", template: "%s · Attest" },
  description: "Create, run and debug repeatable browser tests without writing code.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // next-themes sets data-theme before hydration, hence suppressHydrationWarning.
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        <ThemeProvider>
          <RecoveryRedirect />
          {children}
          <Toaster position="bottom-right" closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
