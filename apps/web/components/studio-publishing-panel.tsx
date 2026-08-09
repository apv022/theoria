"use client";

import { slug } from "@theoria/authoring";
import type { EngineResult } from "@theoria/mcf-browser";
import type { PackageDraft } from "@theoria/package-model";
import {
  PlatformOperationError,
  type AccountIdentity,
  type PublishedPackage,
  type PublishingResult,
} from "@theoria/platform-client";
import { Button, LinkButton, Notice, Status } from "@theoria/ui";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAuth } from "./auth-provider";

const semver =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;
const nextPatch = (value: string): string => {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(value);
  return match ? `${match[1]}.${match[2]}.${Number(match[3]) + 1}` : "1.0.0";
};

export function StudioPublishingPanel({
  draft,
  identity,
  validate,
  onClaim,
  onPublished,
}: {
  readonly draft: PackageDraft;
  readonly identity: AccountIdentity | null;
  readonly validate: () => Promise<EngineResult>;
  readonly onClaim: () => void;
  readonly onPublished: (
    result: PublishingResult,
    validation: Extract<EngineResult, { status: "ok" }>,
  ) => Promise<void>;
}) {
  const { platform } = useAuth();
  const packageValue = draft.normalizedPackage as
    | Record<string, unknown>
    | undefined;
  const fixedSlug = draft.publication?.slug;
  const [repositoryId] = useState(
    () => draft.publication?.remotePackageId ?? crypto.randomUUID(),
  );
  const [ownedRepositories, setOwnedRepositories] = useState<
    readonly PublishedPackage[]
  >([]);
  const [repositoryChoice, setRepositoryChoice] = useState(
    draft.publication?.remotePackageId ?? "new",
  );
  const [packageSlug, setPackageSlug] = useState(
    fixedSlug ?? slug(draft.title),
  );
  const [version, setVersion] = useState(
    draft.publication
      ? nextPatch(draft.publication.lastPublishedVersion)
      : String(packageValue?.version ?? "1.0.0"),
  );
  const [visibility, setVisibility] = useState<
    "public" | "unlisted" | "private"
  >("private");
  const [releaseNotes, setReleaseNotes] = useState("");
  const [available, setAvailable] = useState<boolean>();
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<string>();
  const [percentage, setPercentage] = useState(0);
  const [error, setError] = useState<string>();
  const [retryable, setRetryable] = useState(false);
  const [success, setSuccess] = useState<PublishingResult>();
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    setAvailable(fixedSlug ? true : undefined);
  }, [fixedSlug, packageSlug]);

  useEffect(() => {
    if (!identity || draft.origin) return;
    void platform.repository
      .listOwned()
      .then(({ packages: repositories }) => {
        setOwnedRepositories(repositories);
        const published = repositories.find(
          (repository) => repository.id === draft.publication?.remotePackageId,
        );
        if (published) setVisibility(published.visibility);
      })
      .catch(() => {
        setOwnedRepositories([]);
        setError(
          "Owned repositories could not be loaded. Nothing was removed; reload to retry.",
        );
      });
  }, [draft.origin, draft.publication, identity, platform]);

  const selectedRepository = ownedRepositories.find(
    (item) => item.id === repositoryChoice,
  );

  const checkSlug = async () => {
    setError(undefined);
    try {
      const result = await platform.publishing.slugAvailable(
        packageSlug,
        draft.publication?.remotePackageId ?? selectedRepository?.id,
      );
      setAvailable(result);
      if (!result) setError("That package slug is already in use.");
      return result;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Slug check failed.");
      return false;
    }
  };

  const publish = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    setRetryable(false);
    setSuccess(undefined);
    const abortController = new AbortController();
    controller.current = abortController;
    void (async () => {
      if (!identity) throw new Error("Sign in before publishing.");
      if (draft.owner?.userId !== identity.id)
        throw new Error("Claim this local draft before publishing.");
      if (!semver.test(version))
        throw new Error("Enter a semantic version such as 1.0.0.");
      if (!(await checkSlug())) return;
      setPhase("Validating canonical source");
      setPercentage(5);
      const validation = await validate();
      if (
        validation.status !== "ok" ||
        validation.validation.state !== "valid" ||
        validation.diagnostics.some(
          (diagnostic) => diagnostic.severity === "error",
        )
      )
        throw new PlatformOperationError(
          "VALIDATION_REQUIRED",
          "Resolve every validation error before publishing.",
        );
      const result = await platform.publishing.publish(
        {
          ...(draft.publication
            ? { packageId: draft.publication.remotePackageId }
            : selectedRepository
              ? { packageId: selectedRepository.id }
              : { repositoryId }),
          ...(draft.origin
            ? {
                parentPackageId: draft.origin.packageId,
                parentVersionId: draft.origin.versionId,
              }
            : {}),
          slug: packageSlug,
          title: validation.summary.manifest.title,
          description: validation.summary.manifest.description ?? "",
          visibility,
          version,
          mcfVersion: validation.summary.manifest.mcf,
          packageKind: validation.summary.manifest.kind,
          sourceChecksum: validation.summary.sourceChecksum,
          manifestSummary: {
            ...validation.summary.manifest,
            lessonCount: validation.summary.lessonCount,
            activityCount: validation.summary.activityCount,
            questionCount: validation.summary.questionCount,
          },
          validationSummary: validation.validation,
          releaseNotes,
          archive: new Blob([validation.sourceArchive], {
            type: "application/zip",
          }),
        },
        {
          signal: abortController.signal,
          onProgress: (nextPhase, nextPercentage) => {
            setPhase(
              nextPhase === "checking"
                ? "Packaging validated source"
                : nextPhase === "uploading"
                  ? "Uploading immutable package"
                  : nextPhase === "finalizing"
                    ? "Finalizing repository version"
                    : "Published",
            );
            setPercentage(nextPercentage);
          },
        },
      );
      await onPublished(result, validation);
      setSuccess(result);
    })()
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === "AbortError")
          setError("Publishing was cancelled before finalization.");
        else {
          setError(
            reason instanceof Error ? reason.message : "Publishing failed.",
          );
          setRetryable(
            reason instanceof PlatformOperationError && reason.retryable,
          );
        }
      })
      .finally(() => {
        setBusy(false);
        controller.current = null;
      });
  };

  if (!identity)
    return (
      <section className="studio-form publish-panel">
        <p className="section-label">Repository publishing</p>
        <h2>Sign in to publish</h2>
        <p>
          Authoring, validation, preview, and export remain available without an
          account. Only repository publication requires authentication.
        </p>
        <LinkButton href="/login">Sign in</LinkButton>
      </section>
    );

  if (!draft.owner)
    return (
      <section className="studio-form publish-panel">
        <p className="section-label">Repository publishing</p>
        <h2>Claim this local draft</h2>
        <p>
          Claiming records your account ID only in this browser. It does not
          upload the draft or any learner data.
        </p>
        <Button onClick={onClaim}>Claim local draft</Button>
      </section>
    );

  if (draft.owner.userId !== identity.id)
    return (
      <Notice title="Different local owner">
        This draft is claimed by another account and cannot be published under @
        {identity.profile.handle}.
      </Notice>
    );

  return (
    <form className="studio-form publish-panel" onSubmit={publish}>
      <header>
        <div>
          <p className="section-label">Repository publishing</p>
          <h2>
            {draft.publication ? "Publish a new version" : "Create package"}
          </h2>
        </div>
        <Status
          tone={draft.validation.state === "valid" ? "positive" : "warning"}
        >
          {draft.validation.state}
        </Status>
      </header>
      <Notice title="Published versions are immutable">
        Canonical source, version number, checksum, and release metadata cannot
        be edited or replaced after publication. Your local draft remains
        independent and editable.
      </Notice>
      {draft.origin ? (
        <Notice title="Fork lineage will be permanent">
          Publishing creates a new repository forked from @
          {draft.origin.creatorHandle}/{draft.origin.slug} at version{" "}
          {draft.origin.version}. The exact parent release cannot later be
          removed or changed.
        </Notice>
      ) : null}
      {!draft.publication && !draft.origin ? (
        <label className="field">
          <span>Destination repository</span>
          <select
            value={repositoryChoice}
            disabled={busy}
            onChange={(event) => {
              const choice = event.target.value;
              setRepositoryChoice(choice);
              const repository = ownedRepositories.find(
                (item) => item.id === choice,
              );
              if (repository) {
                setPackageSlug(repository.slug);
                setVisibility(repository.visibility);
                const latest = repository.versions[0];
                if (latest) setVersion(nextPatch(latest.version));
                setAvailable(true);
              } else {
                setPackageSlug(slug(draft.title));
                setAvailable(undefined);
              }
            }}
          >
            <option value="new">Create a new repository</option>
            {ownedRepositories.map((repository) => (
              <option key={repository.id} value={repository.id}>
                Add a version to {repository.title}
              </option>
            ))}
          </select>
          <small>
            Every listed destination belongs exclusively to @
            {identity.profile.handle}.
          </small>
        </label>
      ) : null}
      <div className="form-columns">
        <label className="field">
          <span>Package slug</span>
          <input
            value={packageSlug}
            readOnly={Boolean(fixedSlug || selectedRepository)}
            minLength={3}
            maxLength={63}
            pattern="[a-z][a-z0-9-]{2,62}"
            onChange={(event) => {
              setPackageSlug(event.target.value.toLowerCase());
              setAvailable(undefined);
            }}
            required
          />
          <small>
            {fixedSlug || selectedRepository
              ? "Stable after the first publication."
              : "Lowercase letters, numbers, and hyphens."}
          </small>
        </label>
        <label className="field">
          <span>Semantic version</span>
          <input
            value={version}
            pattern="(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?"
            onChange={(event) => setVersion(event.target.value)}
            required
          />
        </label>
        <label className="field">
          <span>Visibility</span>
          <select
            value={visibility}
            onChange={(event) =>
              setVisibility(
                event.target.value as "public" | "unlisted" | "private",
              )
            }
          >
            <option value="private">Private — owner only</option>
            <option value="unlisted">Unlisted — direct link</option>
            <option value="public">Public</option>
          </select>
        </label>
      </div>
      <div className="studio-inline-actions">
        <Button
          type="button"
          className="button-secondary"
          disabled={busy || Boolean(fixedSlug || selectedRepository)}
          onClick={() => void checkSlug()}
        >
          Check slug
        </Button>
        {available === true ? (
          <Status tone="positive">Slug available</Status>
        ) : available === false ? (
          <Status tone="warning">Slug unavailable</Status>
        ) : null}
      </div>
      <label className="field">
        <span>Release notes</span>
        <textarea
          rows={5}
          maxLength={10_000}
          value={releaseNotes}
          onChange={(event) => setReleaseNotes(event.target.value)}
          placeholder="What changed in this immutable version?"
        />
      </label>
      {busy ? (
        <div className="publishing-progress" role="status">
          <strong>{phase ?? "Preparing publication"}</strong>
          <progress value={percentage} max={100} />
          <Button
            type="button"
            className="button-secondary"
            onClick={() => controller.current?.abort()}
          >
            Cancel
          </Button>
        </div>
      ) : null}
      {error ? (
        <p className="form-message error-message" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <div className="publishing-success" role="status">
          <strong>
            Published {success.slug} version {success.version}
          </strong>
          <LinkButton
            href={`/packages/${success.slug}/versions/${success.version}`}
          >
            View immutable version
          </LinkButton>
        </div>
      ) : null}
      <Button disabled={busy}>
        {busy
          ? "Publishing…"
          : retryable
            ? "Retry publish"
            : draft.publication
              ? "Publish new immutable version"
              : "Publish first version"}
      </Button>
    </form>
  );
}
