import { Brand, Navigation, SkipLink } from "@theoria/ui";
import type { ReactNode } from "react";

export default function ReaderLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <div className="reader-shell">
      <SkipLink />
      <header className="reader-header">
        <Brand compact />
        <Navigation
          items={[{ href: "/library", label: "Exit reader" }]}
          label="Reader"
        />
      </header>
      <main id="main">{children}</main>
    </div>
  );
}
