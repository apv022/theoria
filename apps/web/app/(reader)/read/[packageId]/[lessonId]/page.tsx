import type { Metadata } from "next";
import { ReaderExperience } from "@/components/reader-experience";

interface Props {
  readonly params: Promise<{ packageId: string; lessonId: string }>;
}

export const metadata: Metadata = { title: "Reader" };

export default async function LessonPage({ params }: Props) {
  const { packageId, lessonId } = await params;
  return (
    <ReaderExperience
      packageId={decodeURIComponent(packageId)}
      lessonId={decodeURIComponent(lessonId)}
    />
  );
}
