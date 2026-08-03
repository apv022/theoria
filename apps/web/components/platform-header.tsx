"use client";

import { Brand } from "@theoria/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { AccountNavigation } from "./account-navigation";
import { onboardingOpenEvent } from "./onboarding";
import { ThemeControl } from "./theme-control";

const items = [
  { href: "/explore", label: "Explore" },
  { href: "/library", label: "Library" },
  { href: "/studio", label: "Studio" },
  { href: "/compile", label: "Compiler" },
] as const;

const active = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

export function PlatformHeader({
  className = "site-header",
  workspace,
  workspaceAction,
}: {
  readonly className?: string;
  readonly workspace?: string;
  readonly workspaceAction?: { readonly href: string; readonly label: string };
}) {
  const pathname = usePathname();
  const mobileMenu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    mobileMenu.current?.removeAttribute("open");
  }, [pathname]);
  const openHelp = () => dispatchEvent(new Event(onboardingOpenEvent));
  const links = (
    <>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={active(pathname, item.href) ? "page" : undefined}
        >
          {item.label}
        </Link>
      ))}
      <Link href="/explore#search">Search</Link>
    </>
  );
  return (
    <header className={`platform-header ${className}`}>
      <Brand />
      {workspace ? <span className="workspace-label">{workspace}</span> : null}
      <nav className="platform-primary" aria-label="Primary navigation">
        {links}
      </nav>
      <details className="platform-mobile-menu" ref={mobileMenu}>
        <summary>Menu</summary>
        <nav aria-label="Mobile navigation">
          {links}
          <div className="platform-mobile-tools">
            {workspaceAction ? (
              <Link className="workspace-action" href={workspaceAction.href}>
                {workspaceAction.label}
              </Link>
            ) : null}
            <ThemeControl compact />
            <button className="header-action" type="button" onClick={openHelp}>
              Help
            </button>
          </div>
        </nav>
      </details>
      <div className="platform-utilities">
        {workspaceAction ? (
          <Link className="workspace-action" href={workspaceAction.href}>
            {workspaceAction.label}
          </Link>
        ) : null}
        <ThemeControl compact />
        <button className="header-action" type="button" onClick={openHelp}>
          Help
        </button>
        <AccountNavigation showSearch={false} />
      </div>
    </header>
  );
}
