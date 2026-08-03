import { SkipLink } from "@theoria/ui";
import type { ReactNode } from "react";
import { PlatformHeader } from "../../components/platform-header";

export default function CompilerLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <div className="compiler-shell">
      <SkipLink />
      <PlatformHeader className="compiler-header" workspace="Compiler" />
      <main id="main">{children}</main>
    </div>
  );
}
