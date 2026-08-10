import { Notice, Status } from "@theoria/ui";
import Link from "next/link";
import type { Metadata } from "next";
import { PublishedPackageActions } from "../../../../components/published-package-actions";
import { RepositoryDeleteAction } from "../../../../components/repository-delete-action";
import { PackageCover } from "../../../../components/package-cover";
import { serverPlatformClient } from "../../../../lib/platform/server";

interface Props {
  readonly params: Promise<{ slug: string }>;
}

export const metadata: Metadata = { title: "Package" };
export const dynamic = "force-dynamic";

export default async function PackagePage({ params }: Props) {
  const { slug } = await params;
  const platform = await serverPlatformClient();

  if (!platform.authentication.configured)
    return (
      <div className="page-wrap narrow-page">
        <h1>{slug.replaceAll("-", " ")}</h1>
        <Notice title="Repository is not configured">
          Local Creation Studio, Library, Reader, and exports remain fully
          available.
        </Notice>
      </div>
    );
  let packageValue;
  try {
    packageValue = await platform.repository.getBySlug(slug);
  } catch {
    return (
      <div className="page-wrap narrow-page">
        <h1>Repository unavailable</h1>
        <Notice title="Package service unavailable">
          This package could not be loaded. Local Library, Reader, Creation
          Studio, and exports remain available; reload to retry.
        </Notice>
      </div>
    );
  }
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
  let network;
  try {
    network = await platform.repository.getNetwork(packageValue.id);
  } catch {
    network = undefined;
  }
  const textList = (value: unknown): string => {
    if (!Array.isArray(value) || value.length === 0) return "Not declared";
    return value
      .map((item) =>
        typeof item === "string"
          ? item
          : item && typeof item === "object" && "statement" in item
            ? String(item.statement)
            : item && typeof item === "object" && "identifier" in item
              ? String(item.identifier)
              : "",
      )
      .filter(Boolean)
      .join(", ");
  };
  return (
    <div className="page-wrap detail-page published-package-page">
      <nav className="repository-tabs" aria-label="Repository sections">
        <a href="#overview">Overview</a>
        <a href="#content">Content</a>
        <a href="#versions">Versions</a>
        <a href="#lineage">Lineage</a>
      </nav>
      <p className="section-label">Published course</p>
      <div className="detail-grid">
        <div className="detail-cover">
          <PackageCover
            src={
              typeof manifest?.cover === "string" && latest
                ? `/api/packages/${encodeURIComponent(packageValue.slug)}/versions/${encodeURIComponent(latest.version)}/cover`
                : undefined
            }
            title={packageValue.title}
            kind={latest?.packageKind}
            stableId={packageValue.id}
          />
          <span>{latest?.packageKind ?? "Learning package"}</span>
          <small>Published source available</small>
        </div>
        <article id="overview">
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
            <PublishedPackageActions
              slug={packageValue.slug}
              version={latest.version}
              manifestId={String(latest.manifestSummary.id)}
              manifestVersion={latest.manifestSummary.version}
              sourceChecksum={latest.sourceChecksum}
              remotePackageId={packageValue.id}
              remoteVersionId={latest.id}
              title={packageValue.title}
              creatorHandle={packageValue.creator.handle}
              initialNetwork={network}
            />
          ) : null}
        </article>
      </div>
      {latest && manifest ? (
        <section id="content" className="package-metadata-grid">
          <article>
            <p className="section-label">Course details</p>
            <h2>About this course</h2>
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
                <dt>Duration</dt>
                <dd>{String(summary?.duration ?? "Not declared")}</dd>
              </div>
              <div>
                <dt>Curriculum</dt>
                <dd>{textList(summary?.curriculum)}</dd>
              </div>
              <div>
                <dt>Prerequisites</dt>
                <dd>{textList(summary?.prerequisites)}</dd>
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
            <p className="section-label">Technical metadata</p>
            <h2>Package format and contents</h2>
            <details className="technical-package-details">
              <summary>Show technical package details</summary>
              <dl className="facts">
                <div>
                  <dt>Format version</dt>
                  <dd>MCF {latest.mcfVersion}</dd>
                </div>
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
                  <dt>Files / assets</dt>
                  <dd>
                    {String(summary?.fileCount ?? "Not reported")} /{" "}
                    {String(summary?.assetCount ?? "Not reported")}
                  </dd>
                </div>
                <div>
                  <dt>Validation</dt>
                  <dd>{latest.validationSummary.state}</dd>
                </div>
              </dl>
            </details>
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
      <section id="versions" className="version-history">
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
                    {version.packageKind} · MCF {version.mcfVersion} ·{" "}
                    {version.sourceSize < 1024
                      ? `${version.sourceSize} B`
                      : `${(version.sourceSize / 1024).toFixed(1)} KiB`}
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
      <section id="lineage" className="version-history repository-lineage">
        <p className="section-label">Repository network</p>
        {!network ? (
          <Notice title="Lineage unavailable">
            Star and fork counts could not be loaded. The canonical package and
            its immutable versions remain available.
          </Notice>
        ) : (
          <>
            <h2>
              {network.starCount} {network.starCount === 1 ? "star" : "stars"} ·{" "}
              {network.forkCount} {network.forkCount === 1 ? "fork" : "forks"}
            </h2>
            {network.parent ? (
              <p>
                Forked from{" "}
                <Link href={`/packages/${network.parent.slug}`}>
                  @{network.parent.creatorHandle}/{network.parent.title}
                </Link>{" "}
                at version {network.parent.version}.
              </p>
            ) : (
              <p>This repository is an original publication.</p>
            )}
            {network.directForks.length ? (
              <ul>
                {network.directForks.map((fork) => (
                  <li key={`${fork.creatorHandle}/${fork.slug}`}>
                    <Link href={`/packages/${fork.slug}`}>
                      @{fork.creatorHandle}/{fork.title}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No public direct forks yet.</p>
            )}
          </>
        )}
      </section>
      <RepositoryDeleteAction
        packageId={packageValue.id}
        ownerId={packageValue.ownerId}
        slug={packageValue.slug}
      />
    </div>
  );
}
