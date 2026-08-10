import type { ReactNode } from "react";
import { AppShell } from "../../components/app-shell";

export default function StudioLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return <AppShell>{children}</AppShell>;
}
