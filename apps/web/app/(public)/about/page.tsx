import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "About Theoria" };

export default function AboutPage() {
  return (
    <div className="page-wrap narrow-page about-page">
      <header className="page-heading">
        <p className="section-label">About Theoria</p>
        <h1>Learning that can travel.</h1>
        <p className="about-lede">
          Theoria is a local-first place to discover, learn from, and create
          open courses. Your library and drafts remain useful on this device;
          an account is an explicit choice for publishing and synchronization.
        </p>
      </header>

      <div className="about-sections">
        <section>
          <p className="section-label">Open course source</p>
          <h2>Courses are more than a page.</h2>
          <p>
            A Theoria course is a portable source package with its lessons,
            activities, metadata, and release history together. Authors can
            keep working on the source, while learners can use a published
            version with a clear record of what they started.
          </p>
        </section>
        <section>
          <p className="section-label">Learn and create</p>
          <h2>One place for both sides of the work.</h2>
          <p>
            Explore public material, save it to Learn, and read at your own
            pace. In Creation, authors can validate, preview, export, and
            publish a version without turning an editable draft into an
            accidental release.
          </p>
        </section>
        <section>
          <p className="section-label">Why open infrastructure</p>
          <h2>Knowledge should not be trapped in one interface.</h2>
          <p>
            Portable, versioned courses make it easier to preserve teaching,
            share improvements, and keep a learner&apos;s context legible over
            time. Theoria treats the course source and its provenance as part
            of the learning experience.
          </p>
        </section>
      </div>

      <p className="about-next-step">
        <Link className="button" href="/explore">
          Explore courses
        </Link>{" "}
        <Link className="button button-secondary" href="/studio">
          Open Creation
        </Link>
      </p>
    </div>
  );
}
