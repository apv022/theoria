import { StudioDashboard } from "../../../components/studio-dashboard";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Studio" };

export default function StudioPage() {
  return <StudioDashboard />;
}
