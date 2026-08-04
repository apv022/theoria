import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthProvider } from "../components/auth-provider";
import { OfflineRegistration } from "../components/offline-registration";
import { Onboarding } from "../components/onboarding";
import "katex/dist/katex.min.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Theoria", template: "%s · Theoria" },
  description: "A repository-first home for portable MCF learning packages.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/theoria-mark.svg",
    shortcut: "/theoria-mark.svg",
    apple: "/theoria-mark.svg",
  },
};

const themeBoot = `(()=>{try{const s=localStorage.getItem("theoria-theme");const p=s==="light"||s==="dark"||s==="system"?s:"system";const d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);const r=document.documentElement;r.dataset.theme=d?"dark":"light";r.dataset.themePreference=p;r.style.colorScheme=d?"dark":"light"}catch{}})()`;

export default function RootLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body>
        <OfflineRegistration />
        <AuthProvider>
          {children}
          <Onboarding />
        </AuthProvider>
      </body>
    </html>
  );
}
