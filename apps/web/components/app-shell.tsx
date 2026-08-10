"use client";

import { Brand, SkipLink } from "@theoria/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AccountNavigation } from "./account-navigation";
import { onboardingOpenEvent } from "./onboarding";
import { ThemeControl } from "./theme-control";

const sidebarStorageKey = "theoria-sidebar-collapsed";

const navigation = [
  { href: "/", label: "Home", icon: "⌂" },
  { href: "/explore", label: "Explore", icon: "⌕" },
  { href: "/library", label: "Learn", icon: "▤" },
  { href: "/studio", label: "Create", icon: "✦" },
] as const;

const isActive = (pathname: string, href: string) => {
  if (href === "/") return pathname === "/";
  if (href === "/studio" && pathname === "/compile") return true;
  return pathname === href || pathname.startsWith(`${href}/`);
};

export function AppShell({
  children,
  footer = false,
}: {
  readonly children: ReactNode;
  readonly footer?: boolean;
}) {
  const pathname = usePathname();
  const menuButton = useRef<HTMLButtonElement>(null);
  const sidebar = useRef<HTMLElement>(null);
  const firstLink = useRef<HTMLAnchorElement>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);

  const closeDrawer = useCallback((restoreFocus = false) => {
    setDrawerOpen(false);
    if (restoreFocus) menuButton.current?.focus();
  }, []);

  useEffect(() => {
    setCollapsed(localStorage.getItem(sidebarStorageKey) === "true");
    const media = matchMedia("(max-width: 900px)");
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => closeDrawer(), [pathname, closeDrawer]);

  useEffect(() => {
    if (!mobile || !drawerOpen) return;
    const panel = sidebar.current;
    const pointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panel?.contains(target) && !menuButton.current?.contains(target))
        closeDrawer();
    };
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDrawer(true);
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), summary, input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => !element.hasAttribute("hidden"));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    addEventListener("pointerdown", pointerDown);
    addEventListener("keydown", keyDown);
    const focusTimer = window.setTimeout(() => firstLink.current?.focus(), 0);
    return () => {
      window.clearTimeout(focusTimer);
      removeEventListener("pointerdown", pointerDown);
      removeEventListener("keydown", keyDown);
    };
  }, [closeDrawer, drawerOpen, mobile]);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(sidebarStorageKey, String(next));
  };
  const openHelp = () => dispatchEvent(new Event(onboardingOpenEvent));

  return (
    <div className="app-shell" data-sidebar-collapsed={collapsed || undefined}>
      <SkipLink />
      <header className="app-header platform-header">
        <div className="app-header-brand">
          <Brand compact={collapsed && !mobile} />
        </div>
        <button
          ref={menuButton}
          className="app-menu-button"
          type="button"
          aria-expanded={drawerOpen}
          aria-controls="theoria-application-navigation"
          onClick={() => setDrawerOpen((open) => !open)}
        >
          <span aria-hidden="true">☰</span>
          <span>{drawerOpen ? "Close" : "Menu"}</span>
        </button>
        <span className="app-header-context">Portable learning</span>
        <div className="platform-utilities">
          <ThemeControl compact />
          <button className="header-action" type="button" onClick={openHelp}>
            Help
          </button>
        </div>
      </header>

      <aside
        ref={sidebar}
        id="theoria-application-navigation"
        className="app-sidebar"
        data-open={drawerOpen || undefined}
        aria-hidden={mobile && !drawerOpen}
        inert={mobile && !drawerOpen ? true : undefined}
        aria-label="Application navigation"
      >
        <button
          className="app-sidebar-collapse"
          type="button"
          aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
          title={collapsed ? "Expand navigation" : "Collapse navigation"}
          onClick={toggleCollapsed}
        >
          <span aria-hidden="true">{collapsed ? "›" : "‹"}</span>
          <span className="app-nav-label">
            {collapsed ? "Expand" : "Collapse"}
          </span>
        </button>
        <nav className="app-sidebar-primary" aria-label="Primary navigation">
          {navigation.map((item, index) => (
            <Link
              key={item.href}
              ref={index === 0 ? firstLink : undefined}
              href={item.href}
              title={collapsed && !mobile ? item.label : undefined}
              aria-current={isActive(pathname, item.href) ? "page" : undefined}
              onClick={() => closeDrawer()}
            >
              <span className="app-nav-icon" aria-hidden="true">
                {item.icon}
              </span>
              <span className="app-nav-label">{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="app-sidebar-bottom">
          <Link
            className="app-about-link"
            href="/about"
            title={collapsed && !mobile ? "About Theoria" : undefined}
            onClick={() => closeDrawer()}
          >
            <span className="app-nav-icon" aria-hidden="true">
              ?
            </span>
            <span className="app-nav-label">About Theoria</span>
          </Link>
          <div className="app-sidebar-account">
            <AccountNavigation showSearch={false} />
          </div>
        </div>
      </aside>
      <button
        className="app-drawer-backdrop"
        type="button"
        aria-label="Close navigation"
        tabIndex={drawerOpen ? 0 : -1}
        data-open={drawerOpen || undefined}
        onClick={() => closeDrawer(true)}
      />

      <div className="app-frame">
        <main id="main">{children}</main>
        {footer ? (
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
        ) : null}
      </div>
    </div>
  );
}
