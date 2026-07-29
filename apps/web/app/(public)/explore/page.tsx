import { Field, LinkButton, Notice, Status } from "@theoria/ui";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Explore" };

const packages = [
  {
    slug: "mcf-authoring-masterclass",
    title: "Authoring MCF Courses",
    kind: "Course",
    version: "1.1",
    accent: "ink",
  },
  {
    slug: "feature-showcase",
    title: "MCF Feature Showcase",
    kind: "Course",
    version: "1.1",
    accent: "gold",
  },
  {
    slug: "minimal-course",
    title: "A Minimal MCF Course",
    kind: "Course",
    version: "1.0",
    accent: "sage",
  },
] as const;

export default function ExplorePage() {
  return (
    <div className="page-wrap">
      <header className="page-heading split-heading">
        <div>
          <p className="section-label">Public repository</p>
          <h1>Explore packages</h1>
        </div>
        <p>
          Discovery is represented with local fixture metadata until the
          repository service exists.
        </p>
      </header>
      <div id="search" className="search-panel">
        <Field
          label="Search packages"
          placeholder="Search is not connected yet"
          disabled
        />
        <Status tone="warning">Repository search deferred</Status>
      </div>
      <div className="package-grid">
        {packages.map((item, index) => (
          <article
            className={`package-card card-${item.accent}`}
            key={item.slug}
          >
            <div className="package-cover">
              <span>Θ/{String(index + 1).padStart(2, "0")}</span>
              <strong>{item.title.slice(0, 1)}</strong>
            </div>
            <div className="package-meta">
              <p>
                {item.kind} · MCF {item.version}
              </p>
              <h2>{item.title}</h2>
              <LinkButton href={`/packages/${item.slug}`} secondary>
                View package
              </LinkButton>
            </div>
          </article>
        ))}
      </div>
      <Notice title="Fixture-backed preview">
        These cards demonstrate the repository presentation boundary. They are
        not claims of a live catalog, rankings, downloads, or server validation.
      </Notice>
    </div>
  );
}
