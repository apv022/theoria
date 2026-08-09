import type { PublishedPackage } from "@theoria/platform-client";
import { Status } from "@theoria/ui";
import Link from "next/link";
import { PackageCover } from "./package-cover";

const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

export const manifestSubjects = (
  packageValue: PublishedPackage,
): readonly string[] => {
  const value = packageValue.versions[0]?.manifestSummary.subjects;
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
};

export const manifestLevel = (
  packageValue: PublishedPackage,
): string | undefined => {
  const value = packageValue.versions[0]?.manifestSummary.level;
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const record = value as Record<string, unknown>;
  return text(record.label) ?? text(record.identifier);
};

export function RepositoryPackageCard({
  packageValue,
}: {
  readonly packageValue: PublishedPackage;
}) {
  const latest = packageValue.versions[0];
  if (!latest) return null;
  const manifest = latest.manifestSummary;
  const subjects = manifestSubjects(packageValue);
  const level = manifestLevel(packageValue);
  const headingId = `package-${packageValue.id}`;
  const cover =
    typeof manifest.cover === "string"
      ? `/api/packages/${encodeURIComponent(packageValue.slug)}/versions/${encodeURIComponent(latest.version)}/cover`
      : undefined;
  return (
    <article className="repository-card" aria-labelledby={headingId}>
      <PackageCover
        className="repository-card-cover"
        src={cover}
        title={packageValue.title}
        kind={latest.packageKind}
        stableId={packageValue.id}
      />
      <div className="repository-card-body">
        <div className="repository-card-status">
          <Status>{latest.packageKind.replaceAll("_", " ")}</Status>
        </div>
        <h2 id={headingId}>
          <Link href={`/packages/${packageValue.slug}`}>
            {packageValue.title}
          </Link>
        </h2>
        <p className="repository-card-description">
          {packageValue.description || "No description was provided."}
        </p>
        <p className="repository-card-creator">
          By{" "}
          <Link href={`/profiles/${packageValue.creator.handle}`}>
            @{packageValue.creator.handle}
          </Link>
        </p>
        {subjects.length ? (
          <ul className="metadata-tags" aria-label="Subjects">
            {subjects.slice(0, 4).map((subject) => (
              <li key={subject}>
                <Link href={`/explore?subject=${encodeURIComponent(subject)}`}>
                  {subject}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        <dl className="repository-card-facts">
          <div>
            <dt>Version</dt>
            <dd>{latest.version}</dd>
          </div>
          <div>
            <dt>Format</dt>
            <dd>{latest.mcfVersion}</dd>
          </div>
          <div>
            <dt>Language</dt>
            <dd>{manifest.language}</dd>
          </div>
          <div>
            <dt>Level</dt>
            <dd>{level ?? "Not declared"}</dd>
          </div>
          <div>
            <dt>License</dt>
            <dd>{manifest.license ?? "Not declared"}</dd>
          </div>
        </dl>
        <time dateTime={latest.publishedAt}>
          Published{" "}
          {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
            new Date(latest.publishedAt),
          )}
        </time>
      </div>
    </article>
  );
}
