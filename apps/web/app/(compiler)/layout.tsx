import { Brand, Navigation, SkipLink, Status } from "@theoria/ui";
import type { ReactNode } from "react";

export default function CompilerLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <div className="compiler-shell">
      <SkipLink />
      <header className="compiler-header">
        <Brand />
        <strong>Browser compiler</strong>
        <Navigation
          items={[
            { href: "/studio", label: "Studio" },
            { href: "/", label: "Exit compiler" },
          ]}
          label="Compiler"
        />
        <Status tone="positive">Local only</Status>
      </header>
      <main id="main">{children}</main>
    </div>
  );
}
