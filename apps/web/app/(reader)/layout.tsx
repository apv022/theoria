import { Brand, Navigation, SkipLink } from "@theoria/ui";
import type { ReactNode } from "react";
import { AccountNavigation } from "../../components/account-navigation";

export default function ReaderLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <div className="reader-shell">
      <SkipLink />
      <header className="reader-header">
        <Brand compact />
        <Navigation
          items={[{ href: "/library", label: "Exit reader" }]}
          label="Reader"
        />
        <AccountNavigation showSearch={false} />
      </header>
      <main id="main">{children}</main>
    </div>
  );
}
