import { Brand, Navigation, SkipLink } from "@theoria/ui";
import type { ReactNode } from "react";

const primary = [
  { href: "/explore", label: "Explore" },
  { href: "/library", label: "Library" },
  { href: "/studio", label: "Create" },
] as const;

const utilities = [
  { href: "/explore#search", label: "Search" },
  { href: "/settings", label: "Account" },
] as const;

export default function PublicLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <div className="site-shell">
      <SkipLink />
      <header className="site-header">
        <Brand />
        <Navigation items={primary} label="Primary" className="primary-nav" />
        <Navigation
          items={utilities}
          label="Utilities"
          className="utility-nav"
        />
      </header>
      <main id="main">{children}</main>
      <footer className="site-footer">
        <Brand />
        <p>Portable learning, owned by its authors and learners.</p>
        <p>Foundation preview · MCF 1.0 + 1.1</p>
      </footer>
    </div>
  );
}
