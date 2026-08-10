import type {
  PublishedPackage,
  RepositorySubject,
} from "@theoria/platform-client";
import { LinkButton, Notice, Status } from "@theoria/ui";
import { RepositoryPackageCard } from "../../components/repository-package-card";
import { serverPlatformClient } from "../../lib/platform/server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const platform = await serverPlatformClient();
  let recent: readonly PublishedPackage[] = [];
  let subjects: readonly RepositorySubject[] = [];
  let unavailable = false;
  try {
    [recent, subjects] = await Promise.all([
      platform.repository.listRecent(6),
      platform.repository.listSubjects(8),
    ]);
  } catch {
    unavailable = true;
  }
  return (
    <div className="page-wrap platform-dashboard">
      <header className="dashboard-intro">
        <div>
          <p className="section-label">Portable learning platform</p>
          <h1>Discover, learn, and create portable courses.</h1>
          <p>
            Courses, progress, and drafts work locally without an account.
            Publishing and synchronization remain explicit choices.
          </p>
        </div>
        <form action="/explore" role="search" className="dashboard-search">
          <label className="field">
            <span>Search public courses</span>
            <input
              type="search"
              name="q"
              maxLength={160}
              placeholder="Title, subject, keyword, or creator"
            />
          </label>
          <button className="button">Search</button>
        </form>
      </header>

      <nav className="dashboard-actions" aria-label="Quick actions">
        <LinkButton href="/explore">Explore courses</LinkButton>
        <LinkButton href="/library" secondary>
          Open Library
        </LinkButton>
        <LinkButton href="/studio" secondary>
          Create a course
        </LinkButton>
        <Status tone="positive">Local-first · account optional</Status>
      </nav>

      <section className="dashboard-section home-repository">
        <header className="dashboard-section-heading">
          <div>
            <p className="section-label">Public repository</p>
            <h2>Recently published</h2>
          </div>
          <LinkButton href="/explore" secondary>
            View all
          </LinkButton>
        </header>
        {unavailable ? (
          <Notice title="Repository unavailable">
            Public courses could not be loaded. Work saved in this browser
            remains available through Library and Creation Studio.
          </Notice>
        ) : recent.length ? (
          <div className="repository-grid">
            {recent.map((packageValue) => (
              <RepositoryPackageCard
                key={packageValue.id}
                packageValue={packageValue}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state compact-empty">
            <h3>No public courses yet.</h3>
            <p>
              Private and unlisted releases are intentionally not presented as
              public catalog activity.
            </p>
            <LinkButton href="/studio">Create a course</LinkButton>
          </div>
        )}
        {subjects.length ? (
          <nav className="subject-collections" aria-label="Browse by subject">
            <strong>Browse subjects</strong>
            {subjects.map((subject) => (
              <LinkButton
                key={subject.value}
                href={`/explore?subject=${encodeURIComponent(subject.value)}`}
                secondary
              >
                {subject.value} <span>{subject.packageCount}</span>
              </LinkButton>
            ))}
          </nav>
        ) : null}
      </section>
    </div>
  );
}
