import { SkipLink } from "@theoria/ui";
import type { ReactNode } from "react";
import { PlatformHeader } from "../../components/platform-header";

export default function ReaderLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <div className="reader-shell">
      <SkipLink />
      <PlatformHeader
        className="reader-header"
        workspace="Reader"
        workspaceAction={{ href: "/library", label: "Exit reader" }}
      />
      <main id="main">{children}</main>
    </div>
  );
}
