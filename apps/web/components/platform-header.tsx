"use client";

import { Brand } from "@theoria/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AccountNavigation } from "./account-navigation";
import { onboardingOpenEvent } from "./onboarding";
import { ThemeControl } from "./theme-control";

const siteItems = [
  { href: "/", label: "Home" },
  { href: "/explore", label: "Explore" },
  { href: "/library", label: "Learn" },
  { href: "/studio", label: "Create" },
] as const;

const workspaceItems = [
  { href: "/explore", label: "Explore" },
  { href: "/library", label: "Library" },
  { href: "/studio", label: "Studio" },
  { href: "/compile", label: "Compiler" },
] as const;

const active = (pathname: string, href: string) =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

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
  const siteShell = className === "site-header";
  const menuButton = useRef<HTMLButtonElement>(null);
  const menuPanel = useRef<HTMLElement>(null);
  const firstMenuLink = useRef<HTMLAnchorElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = useCallback(
    (restoreFocus = false) => {
      setMenuOpen(false);
      if (restoreFocus) menuButton.current?.focus();
    },
    [],
  );

  useEffect(() => closeMenu(), [pathname, closeMenu]);

  useEffect(() => {
    if (!menuOpen) return;
    const pointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuPanel.current?.contains(target) && !menuButton.current?.contains(target))
        closeMenu();
    };
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu(true);
      }
    };
    addEventListener("pointerdown", pointerDown);
    addEventListener("keydown", keyDown);
    const focusTimer = window.setTimeout(() => firstMenuLink.current?.focus(), 0);
    return () => {
      window.clearTimeout(focusTimer);
      removeEventListener("pointerdown", pointerDown);
      removeEventListener("keydown", keyDown);
    };
  }, [closeMenu, menuOpen]);

  const openHelp = () => dispatchEvent(new Event(onboardingOpenEvent));
  const items = siteShell ? siteItems : workspaceItems;
  const links = items.map((item) => (
    <Link
      key={item.href}
      ref={item === items[0] ? firstMenuLink : undefined}
      href={item.href}
      aria-current={active(pathname, item.href) ? "page" : undefined}
      onClick={() => closeMenu()}
    >
      {item.label}
    </Link>
  ));

  if (siteShell) {
    return (
      <>
        <aside
          ref={menuPanel}
          id="theoria-application-navigation"
          className="site-sidebar"
          data-open={menuOpen || undefined}
          aria-label="Application navigation"
        >
          <nav className="site-sidebar-primary" aria-label="Primary navigation">
            {links}
          </nav>
          <nav className="site-sidebar-secondary" aria-label="More navigation">
            <Link href="/explore#search" onClick={() => closeMenu()}>
              Search courses
            </Link>
            <Link href="/about" onClick={() => closeMenu()}>
              About Theoria
            </Link>
          </nav>
          <div className="site-sidebar-account">
            <AccountNavigation showSearch={false} />
          </div>
        </aside>
        <button
          className="site-drawer-backdrop"
          type="button"
          aria-label="Close navigation"
          tabIndex={menuOpen ? 0 : -1}
          data-open={menuOpen || undefined}
          onClick={() => closeMenu(true)}
        />
        <header className="platform-header site-header">
          <Link className="site-header-brand" href="/" aria-label="Theoria home">
            <Brand />
          </Link>
          <button
            ref={menuButton}
            className="site-menu-button"
            type="button"
            aria-expanded={menuOpen}
            aria-controls="theoria-application-navigation"
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? "Close" : "Menu"}
          </button>
          <span className="site-header-context">Portable learning</span>
          <div className="platform-utilities">
            <ThemeControl compact />
            <button className="header-action" type="button" onClick={openHelp}>
              Help
            </button>
          </div>
        </header>
      </>
    );
  }

  return (
    <header className={`platform-header ${className}`}>
      <Brand />
      {workspace ? <span className="workspace-label">{workspace}</span> : null}
      <button
        ref={menuButton}
        className="workspace-menu-button"
        type="button"
        aria-expanded={menuOpen}
        aria-controls="theoria-workspace-navigation"
        onClick={() => setMenuOpen((open) => !open)}
      >
        {menuOpen ? "Close" : "Menu"}
      </button>
      <nav
        id="theoria-workspace-navigation"
        ref={menuPanel}
        className="platform-primary"
        data-open={menuOpen || undefined}
        aria-label="Workspace navigation"
      >
        {links}
        <Link className="search-navigation" href="/explore#search" onClick={() => closeMenu()}>
          Search courses
        </Link>
        <div className="platform-mobile-tools">
          {workspaceAction ? (
            <Link className="workspace-action" href={workspaceAction.href} onClick={() => closeMenu()}>
              {workspaceAction.label}
            </Link>
          ) : null}
          <ThemeControl compact />
          <button className="header-action" type="button" onClick={openHelp}>
            Help
          </button>
          <AccountNavigation showSearch={false} />
        </div>
      </nav>
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
