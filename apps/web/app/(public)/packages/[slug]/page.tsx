import { Notice, Status } from "@theoria/ui";
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
  return (
    <div className="page-wrap detail-page published-package-page">
      <p className="section-label">Published MCF package</p>
      <div className="detail-grid">
        <div className="detail-cover">
          <span>{latest?.packageKind ?? "MCF"}</span>
          <strong>Θ</strong>
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
