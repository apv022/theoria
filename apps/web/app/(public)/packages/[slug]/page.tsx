import { LinkButton, Notice, Status } from "@theoria/ui";
import type { Metadata } from "next";

interface Props {
  readonly params: Promise<{ slug: string }>;
}

const names: Readonly<Record<string, string>> = {
  "mcf-authoring-masterclass": "Authoring MCF Courses",
  "feature-showcase": "MCF Feature Showcase",
  "minimal-course": "A Minimal MCF Course",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  return { title: names[slug] ?? "Package" };
}

export default async function PackagePage({ params }: Props) {
  const { slug } = await params;
  const title = names[slug] ?? slug.replaceAll("-", " ");
  return (
    <div className="page-wrap detail-page">
      <p className="section-label">Package detail · Fixture preview</p>
      <div className="detail-grid">
        <div className="detail-cover">
          <span>MCF</span>
          <strong>Θ</strong>
          <small>Portable learning package</small>
        </div>
        <article>
          <Status>Course</Status>
          <h1>{title}</h1>
          <p className="lede">
            A source-owned learning package shown through the new repository
            boundary.
          </p>
          <dl className="facts">
            <div>
              <dt>Format</dt>
              <dd>MCF package</dd>
            </div>
            <div>
              <dt>Execution</dt>
              <dd>Browser-owned</dd>
            </div>
            <div>
              <dt>Repository</dt>
              <dd>Not connected</dd>
            </div>
          </dl>
          <div className="actions">
            <LinkButton href={`/read/${slug}`}>Open reader preview</LinkButton>
            <LinkButton href="/library" secondary>
              Go to library
            </LinkButton>
          </div>
        </article>
      </div>
      <Notice title="Package import is unfinished">
        The browser engine contract exists, but archive inspection, validation,
        compilation, and local library import await the mcf-npm browser adapter.
      </Notice>
    </div>
  );
}
