import type { Metadata } from "next";
import { CourseFactory } from "../../../../components/course-factory";
import { CreationToolNavigation } from "../../../../components/creation-tool-navigation";

export const metadata: Metadata = { title: "Course Factory" };

export default function CourseFactoryPage() {
  return (
    <div className="creation-studio-page">
      <CreationToolNavigation />
      <CourseFactory />
    </div>
  );
}
