import Link from "next/link";
import { CompilerWorkspace } from "../../../components/compiler-workspace";
import { StudioDashboard } from "../../../components/studio-dashboard";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Creation Studio" };

export default async function StudioPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ tool?: string | string[] }>;
}) {
  const rawTool = (await searchParams).tool;
  const tool = Array.isArray(rawTool) ? rawTool[0] : rawTool;
  const compiler = tool === "compiler";
  return (
    <div className="creation-studio-page">
      <nav className="creation-studio-tools" aria-label="Creation Studio tools">
        <Link href="/studio" aria-current={!compiler ? "page" : undefined}>
          Course authoring
        </Link>
        <Link
          href="/studio?tool=compiler"
          aria-current={compiler ? "page" : undefined}
        >
          Compiler tools
        </Link>
      </nav>
      {compiler ? <CompilerWorkspace /> : <StudioDashboard />}
    </div>
  );
}
