import type { Metadata } from "next";
import { CompilerWorkspace } from "@/components/compiler-workspace";

export const metadata: Metadata = { title: "Browser compiler" };

export default function CompilePage() {
  return <CompilerWorkspace />;
}
