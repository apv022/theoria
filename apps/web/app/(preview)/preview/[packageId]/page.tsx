import { ReaderExperience } from "@/components/reader-experience";
import type { Metadata } from "next";

interface Props {
  readonly params: Promise<{ packageId: string }>;
}

export const metadata: Metadata = { title: "Studio preview" };

export default async function PreviewPage({ params }: Props) {
  const { packageId } = await params;
  return (
    <ReaderExperience
      packageId={decodeURIComponent(packageId)}
      mode="preview"
    />
  );
}
