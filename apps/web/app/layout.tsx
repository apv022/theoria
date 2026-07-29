import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthProvider } from "../components/auth-provider";
import { OfflineRegistration } from "../components/offline-registration";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Theoria", template: "%s · Theoria" },
  description: "A repository-first home for portable MCF learning packages.",
};

export default function RootLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <OfflineRegistration />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
