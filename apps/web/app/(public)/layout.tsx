import { Brand, SkipLink } from "@theoria/ui";
import Link from "next/link";
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
        <div className="site-footer-brand">
          <Brand />
          <p>Portable learning, owned by its authors and learners.</p>
        </div>
        <nav aria-label="Footer navigation">
          <Link href="/about">About</Link>
          <Link href="/explore">Explore</Link>
          <Link href="/studio">Create</Link>
          <Link href="/library">Learn</Link>
        </nav>
        <p className="site-footer-note">MCF 1.0 + 1.1 · local-first</p>
      </footer>
    </div>
  );
}
