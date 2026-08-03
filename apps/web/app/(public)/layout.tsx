import { Brand, SkipLink } from "@theoria/ui";
import type { ReactNode } from "react";
import { PlatformHeader } from "../../components/platform-header";

export default function PublicLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <div className="site-shell">
      <SkipLink />
      <PlatformHeader />
      <main id="main">{children}</main>
      <footer className="site-footer">
        <Brand />
        <p>Portable learning, owned by its authors and learners.</p>
        <p>MCF 1.0 + 1.1 · local-first</p>
      </footer>
    </div>
  );
}
