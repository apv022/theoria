import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Creation Studio" };

export default function CompilePage() {
  redirect("/studio?tool=compiler");
}
