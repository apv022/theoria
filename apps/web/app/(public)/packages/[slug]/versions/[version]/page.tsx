import { PublishedPackageActions } from "../../../../../../components/published-package-actions";
import { Notice, Status } from "@theoria/ui";
import Link from "next/link";
import type { Metadata } from "next";
import { serverPlatformClient } from "../../../../../../lib/platform/server";

export const metadata: Metadata = { title: "Package version" };
export const dynamic = "force-dynamic";

export default async function PackageVersionPage({
  params,
}: {
  readonly params: Promise<{ slug: string; version: string }>;
}) {
  const { slug, version } = await params;
  const platform = await serverPlatformClient();
  const release = await platform.repository.getVersion(slug, version);
  if (!release)
    return (
      <div className="page-wrap narrow-page">
        <h1>Version unavailable</h1>
        <Notice title="Not found or private">
          This immutable release does not exist or is not authorized for the
          current account.
        </Notice>
      </div>
    );
  const manifest = release.version.manifestSummary;
  return (
    <div className="page-wrap narrow-page package-version-page">
      <p className="section-label">Immutable package version</p>
      <div className="actions">
        <Status tone="positive">{release.package.visibility}</Status>
        <Status>{release.version.packageKind}</Status>
        <Status>MCF {release.version.mcfVersion}</Status>
      </div>
      <h1>
        {release.package.title} <span>{release.version.version}</span>
      </h1>
      <p>
        Published by{" "}
        <Link href={`/profiles/${release.package.creator.handle}`}>
          @{release.package.creator.handle}
        </Link>{" "}
        on{" "}
        {new Intl.DateTimeFormat("en", { dateStyle: "long" }).format(
          new Date(release.version.publishedAt),
        )}
        .
      </p>
      <dl className="facts">
        <div>
          <dt>Source checksum</dt>
          <dd>
            <code>{release.version.sourceChecksum}</code>
          </dd>
        </div>
        <div>
          <dt>Validation</dt>
          <dd>
            {release.version.validationSummary.state} ·{" "}
            {release.version.validationSummary.diagnostics.length} diagnostics
          </dd>
        </div>
        <div>
          <dt>Manifest ID</dt>
          <dd>
            <code>{String(manifest.id)}</code>
          </dd>
        </div>
        <div>
          <dt>Manifest version</dt>
          <dd>{String(manifest.version)}</dd>
        </div>
        <div>
          <dt>Entry</dt>
          <dd>
            <code>{String(manifest.entry)}</code>
          </dd>
        </div>
        <div>
          <dt>Language</dt>
          <dd>{String(manifest.language ?? "Not declared")}</dd>
        </div>
        <div>
          <dt>License</dt>
          <dd>{String(manifest.license ?? "Not declared")}</dd>
        </div>
        <div>
          <dt>Authors</dt>
          <dd>
            {manifest.authors.length
              ? manifest.authors.join(", ")
              : "Not declared"}
          </dd>
        </div>
      </dl>
      <section className="release-notes">
        <h2>Release notes</h2>
        <p>
          {release.version.releaseNotes || "No release notes were provided."}
        </p>
      </section>
      <PublishedPackageActions slug={slug} version={version} />
      <Notice title="Canonical source is immutable">
        This release points to the validated source `.mcf.zip`. Browser-compiled
        learner output is derived and is not treated as repository source.
      </Notice>
    </div>
  );
}
