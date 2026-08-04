import { SkipLink } from "@theoria/ui";
import type { ReactNode } from "react";

export default function PreviewLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <div className="preview-reader-shell">
      <SkipLink />
      <main id="main">{children}</main>
    </div>
  );
}
