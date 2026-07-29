import { Brand, SkipLink, Status } from "@theoria/ui";
import type { ReactNode } from "react";

export default function InstitutionalLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <div className="org-shell">
      <SkipLink />
      <header>
        <Brand />
        <span>Institutional</span>
        <Status>Placeholder</Status>
      </header>
      <main id="main">{children}</main>
    </div>
  );
}
