import { SkipLink } from "@theoria/ui";
import type { ReactNode } from "react";
import { PlatformHeader } from "../../components/platform-header";

export default function StudioLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <div className="studio-shell">
      <SkipLink />
      <PlatformHeader className="studio-header" workspace="Studio" />
      <main id="main">{children}</main>
    </div>
  );
}
