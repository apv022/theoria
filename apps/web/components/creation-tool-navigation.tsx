"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tools = [
  { href: "/studio", label: "Studio" },
  { href: "/studio/factory", label: "Course Factory" },
  { href: "/studio/batch-upload", label: "Batch Upload" },
];

export function CreationToolNavigation() {
  const pathname = usePathname();
  return (
    <nav className="creation-tool-navigation" aria-label="Creation tools">
      {tools.map((tool) => (
        <Link
          key={tool.href}
          href={tool.href}
          aria-current={
            tool.href === "/studio"
              ? pathname === "/studio" ||
                (pathname !== "/studio/factory" &&
                  pathname !== "/studio/batch-upload" &&
                  /^\/studio\/[^/]+$/.test(pathname))
                ? "page"
                : undefined
              : pathname === tool.href
                ? "page"
                : undefined
          }
        >
          {tool.label}
        </Link>
      ))}
    </nav>
  );
}
