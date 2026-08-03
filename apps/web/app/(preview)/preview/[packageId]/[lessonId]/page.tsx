import { ReaderExperience } from "@/components/reader-experience";
import type { Metadata } from "next";

interface Props {
  readonly params: Promise<{ packageId: string; lessonId: string }>;
}

export const metadata: Metadata = { title: "Studio preview" };

export default async function PreviewLessonPage({ params }: Props) {
  const { packageId, lessonId } = await params;
  return (
    <ReaderExperience
      packageId={decodeURIComponent(packageId)}
      lessonId={decodeURIComponent(lessonId)}
      mode="preview"
    />
  );
}
