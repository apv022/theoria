import { LinkButton, Notice } from "@theoria/ui";
import type { Metadata } from "next";

interface Props {
  readonly params: Promise<{ orgSlug: string }>;
}
export const metadata: Metadata = { title: "Institution" };

export default async function OrgPage({ params }: Props) {
  const { orgSlug } = await params;
  return (
    <div className="org-page">
      <p className="section-label">Institutional workspace</p>
      <h1>{orgSlug.replaceAll("-", " ")}</h1>
      <p className="lede">
        Courses, sections, submissions, grading, and administration will live
        here—separate from the public experience.
      </p>
      <Notice title="Institutional functionality is unfinished">
        This isolated route proves the navigation boundary only. It has no
        organization data, LMS features, permissions, or administration backend.
      </Notice>
      <LinkButton href="/" secondary>
        Return to public site
      </LinkButton>
    </div>
  );
}
