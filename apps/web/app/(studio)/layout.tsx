import { Brand, Navigation, SkipLink, Status } from "@theoria/ui";
import type { ReactNode } from "react";

export default function StudioLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <div className="studio-shell">
      <SkipLink />
      <header className="studio-header">
        <Brand />
        <strong>Studio</strong>
        <Navigation
          items={[{ href: "/", label: "Exit workspace" }]}
          label="Studio"
        />
        <Status>Local draft</Status>
      </header>
      <main id="main">{children}</main>
    </div>
  );
}
