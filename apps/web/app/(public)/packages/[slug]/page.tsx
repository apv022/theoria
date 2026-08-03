import { Notice, Status } from "@theoria/ui";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { serverPlatformClient } from "../../../../lib/platform/server";

interface Props {
  readonly params: Promise<{ slug: string }>;
}

export const metadata: Metadata = { title: "Package" };
export const dynamic = "force-dynamic";

export default async function PackagePage({ params }: Props) {
  const { slug } = await params;
  const platform = await serverPlatformClient();
  const packageValue = await platform.repository.getBySlug(slug);

  if (!platform.authentication.configured)
    return (
      <div className="page-wrap narrow-page">
        <h1>{slug.replaceAll("-", " ")}</h1>
        <Notice title="Repository is not configured">
          Local Studio, Library, Reader, and exports remain fully available.
        </Notice>
      </div>
    );
  if (!packageValue)
    return (
      <div className="page-wrap narrow-page">
        <h1>Package unavailable</h1>
        <Notice title="Not found or private">
          This package does not exist or is not authorized for the current
          account.
        </Notice>
      </div>
    );

  const latest =
    packageValue.versions.find(
      (version) => version.id === packageValue.latestVersionId,
    ) ?? packageValue.versions[0];
  const manifest = latest?.manifestSummary;
  const outcomes = manifest?.learningOutcomes ?? [];
  const subjects = manifest?.subjects ?? [];
  const level = manifest?.level;
  const levelLabel =
    typeof level === "string"
      ? level
      : (level?.label ?? level?.identifier ?? "Not declared");
  const summary = manifest as Readonly<Record<string, unknown>> | undefined;
  return (
    <div className="page-wrap detail-page published-package-page">
      <p className="section-label">Published MCF package</p>
      <div className="detail-grid">
        <div className="detail-cover">
          <span>{latest?.packageKind ?? "MCF"}</span>
          <Image src="/theoria-mark.svg" width={192} height={192} alt="" />
          <small>Canonical source repository</small>
        </div>
        <article>
          <div className="actions">
            <Status tone="positive">{packageValue.visibility}</Status>
            {latest ? <Status>Latest · {latest.version}</Status> : null}
          </div>
          <h1>{packageValue.title}</h1>
          <p className="lede">{packageValue.description}</p>
          <p>
            By{" "}
            <Link href={`/profiles/${packageValue.creator.handle}`}>
              @{packageValue.creator.handle}
            </Link>
          </p>
          {subjects.length ? (
            <ul className="metadata-tags" aria-label="Subjects">
              {subjects.map((subject) => (
                <li key={subject}>
                  <Link
                    href={`/explore?subject=${encodeURIComponent(subject)}`}
                  >
                    {subject}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          {latest ? (
            <Link
              className="button"
              href={`/packages/${packageValue.slug}/versions/${latest.version}`}
            >
              View latest version
            </Link>
          ) : null}
        </article>
      </div>
      {latest && manifest ? (
        <section className="package-metadata-grid">
          <article>
            <p className="section-label">Canonical metadata</p>
            <h2>About this package</h2>
            <dl className="facts">
              <div>
                <dt>Level</dt>
                <dd>{levelLabel}</dd>
              </div>
              <div>
                <dt>Language</dt>
                <dd>{manifest.language}</dd>
              </div>
              <div>
                <dt>License</dt>
                <dd>{manifest.license ?? "Not declared"}</dd>
              </div>
              <div>
                <dt>Attribution</dt>
                <dd>
                  {manifest.authors.length
                    ? manifest.authors.map((author) => author.name).join(", ")
                    : "Not declared"}
                </dd>
              </div>
            </dl>
          </article>
          <article>
            <p className="section-label">Package structure</p>
            <h2>Validated contents</h2>
            <dl className="facts">
              <div>
                <dt>Lessons</dt>
                <dd>{String(summary?.lessonCount ?? 0)}</dd>
              </div>
              <div>
                <dt>Activities</dt>
                <dd>{String(summary?.activityCount ?? 0)}</dd>
              </div>
              <div>
                <dt>Questions</dt>
                <dd>{String(summary?.questionCount ?? 0)}</dd>
              </div>
              <div>
                <dt>Validation</dt>
                <dd>{latest.validationSummary.state}</dd>
              </div>
            </dl>
          </article>
        </section>
      ) : null}
      {outcomes.length ? (
        <section className="learning-outcomes">
          <p className="section-label">Learning outcomes</p>
          <h2>What learners can expect</h2>
          <ol>
            {outcomes.map((outcome, index) => (
              <li key={outcome.id ?? `${index}-${outcome.statement}`}>
                {outcome.statement}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      <section className="version-history">
        <p className="section-label">Immutable releases</p>
        <h2>Version history</h2>
        {packageValue.versions.length ? (
          <ol>
            {packageValue.versions.map((version) => (
              <li key={version.id}>
                <Link
                  href={`/packages/${packageValue.slug}/versions/${version.version}`}
                >
                  <strong>{version.version}</strong>
                  <span>
                    {version.packageKind} · MCF {version.mcfVersion}
                  </span>
                  <time dateTime={version.publishedAt}>
                    {new Intl.DateTimeFormat("en", {
                      dateStyle: "medium",
                    }).format(new Date(version.publishedAt))}
                  </time>
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <p>No immutable releases are available.</p>
        )}
      </section>
    </div>
  );
}
