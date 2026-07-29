import type { Metadata } from "next";
import { ReaderExperience } from "@/components/reader-experience";

interface Props {
  readonly params: Promise<{ packageId: string }>;
}

export const metadata: Metadata = { title: "Reader" };

export default async function ReaderPage({ params }: Props) {
  const { packageId } = await params;
  return <ReaderExperience packageId={decodeURIComponent(packageId)} />;
}
