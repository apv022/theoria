"use client";

import {
  AIProviderError,
  OPENROUTER_PROVIDER_ID,
  createOpenRouterProvider,
  type ModelDescriptor,
  type ProviderConnectionState,
} from "@theoria/ai-provider";
import { draftFromResult, generatedFiles } from "@theoria/authoring";
import {
  factoryCandidatePackage,
  generateFactoryCourse,
  type FactoryBrief,
} from "@theoria/creation-tools";
import {
  WorkerMcfEngine,
  type EngineProgress,
  type EngineResult,
} from "@theoria/mcf-browser";
import { IndexedDbLocalStore } from "@theoria/local-store";
import { Button, Field, LinkButton, Status } from "@theoria/ui";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";

const sessionKey = "theoria:course-factory:brief";
const emptyBrief: FactoryBrief = {
  title: "",
  description: "",
  subject: "",
  learner: "",
  alignment: "",
  instructions: "",
  sourceMaterial: "",
};
const localStore =
  typeof indexedDB === "undefined" ? undefined : new IndexedDbLocalStore();

const disconnected = (): ProviderConnectionState => ({
  status: "disconnected",
  providerId: OPENROUTER_PROVIDER_ID,
});

const resultFailure = (result: EngineResult): readonly string[] =>
  result.status === "error"
    ? result.diagnostics.map((diagnostic) => diagnostic.message)
    : result.status === "unsupported"
      ? [result.reason]
      : ["MCF validation was cancelled."];

export function CourseFactory() {
  const engine = useMemo(() => new WorkerMcfEngine(), []);
  const controller = useRef<AbortController | undefined>(undefined);
  const [brief, setBrief] = useState<FactoryBrief>(emptyBrief);
  const [connection, setConnection] =
    useState<ProviderConnectionState>(disconnected);
  const [models, setModels] = useState<readonly ModelDescriptor[]>([]);
  const [modelId, setModelId] = useState("");
  const [phase, setPhase] = useState("Checking provider");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [draft, setDraft] = useState<{
    readonly id: string;
    readonly title: string;
    readonly chapters: number;
    readonly lessons: number;
    readonly attempts: number;
    readonly cost?: number;
  }>();
  const provider = useMemo(
    () =>
      localStore
        ? createOpenRouterProvider({ credentials: localStore.credentials })
        : undefined,
    [],
  );

  useEffect(() => {
    try {
      const saved = localStorage.getItem(sessionKey);
      if (saved) setBrief({ ...emptyBrief, ...JSON.parse(saved) });
    } catch {
      localStorage.removeItem(sessionKey);
    }
    void engine.initialize();
    if (!provider || !localStore) {
      setError("IndexedDB is unavailable or blocked in this browser.");
      setPhase("Unavailable");
      return () => engine.dispose();
    }
    void provider.connectionStatus().then(async (status) => {
      setConnection(status);
      if (status.status !== "connected") {
        setPhase("Provider required");
        return;
      }
      try {
        const available = [...(await provider.listModels())].sort((a, b) =>
          a.name.localeCompare(b.name),
        );
        setModels(available);
        const saved = await localStore.credentials.selectedModel(
          OPENROUTER_PROVIDER_ID,
        );
        const selected = available.some((model) => model.id === saved)
          ? saved!
          : (available[0]?.id ?? "");
        if (selected && selected !== saved)
          await localStore.credentials.selectModel(
            OPENROUTER_PROVIDER_ID,
            selected,
          );
        setModelId(selected);
        setPhase("Ready");
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : "Models could not be loaded.",
        );
        setPhase("Provider unavailable");
      }
    });
    return () => {
      controller.current?.abort();
      engine.dispose();
    };
  }, [engine, provider]);

  useEffect(() => {
    if (brief !== emptyBrief)
      localStorage.setItem(sessionKey, JSON.stringify(brief));
  }, [brief]);

  const update = (field: keyof FactoryBrief, value: string) =>
    setBrief((current) => ({ ...current, [field]: value }));

  const addSourceFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    if (!files.length) return;
    if (files.some((file) => file.size > 2_000_000)) {
      setError("Text source files must be 2 MB or smaller.");
      return;
    }
    const additions = await Promise.all(
      files.map(
        async (file) => `\n\n--- ${file.name} ---\n${await file.text()}`,
      ),
    );
    update(
      "sourceMaterial",
      `${brief.sourceMaterial}${additions.join("")}`.trim(),
    );
    setError(undefined);
  };

  const chooseModel = async (next: string) => {
    if (!localStore) return;
    await localStore.credentials.selectModel(OPENROUTER_PROVIDER_ID, next);
    setModelId(next);
  };

  const generate = async () => {
    if (!provider || !localStore || !modelId) return;
    setBusy(true);
    setError(undefined);
    setDraft(undefined);
    setPhase("Generating structured candidate");
    const abort = new AbortController();
    controller.current = abort;
    try {
      const result = await generateFactoryCourse({
        provider,
        modelId,
        brief,
        signal: abort.signal,
        validate: async (candidate) => {
          setPhase("Building and validating MCF 1.1");
          const pkg = factoryCandidatePackage(candidate, brief);
          const files = generatedFiles(pkg);
          const ready = await engine.initialize();
          if (ready.status !== "ready")
            return {
              ok: false,
              diagnostics: ["The browser MCF validator is unavailable."],
            };
          const validation = await engine.execute(
            {
              type: "request",
              requestId: crypto.randomUUID(),
              operation: "inspect",
              input: {
                type: "directory",
                name: candidate.title,
                files: files.map((file) => ({
                  path: file.path,
                  bytes: file.bytes.slice(0),
                })),
              },
            },
            (progress: EngineProgress) => setPhase(progress.message),
          );
          return validation.status === "ok" &&
            validation.validation.state === "valid"
            ? { ok: true, artifact: validation, diagnostics: [] }
            : { ok: false, diagnostics: resultFailure(validation) };
        },
      });
      const nextDraft = draftFromResult(result.artifact);
      await localStore.drafts.put(nextDraft);
      const pkg = result.artifact.readerPackage;
      const chapters = pkg.kind === "course" ? pkg.chapters.length : 0;
      const lessons =
        pkg.kind === "course"
          ? pkg.chapters.reduce(
              (total, chapter) => total + chapter.lessons.length,
              0,
            )
          : 0;
      setDraft({
        id: nextDraft.id,
        title: nextDraft.title,
        chapters,
        lessons,
        attempts: result.attempts,
        ...(result.providerResults.at(-1)?.usage?.cost?.amount === undefined
          ? {}
          : { cost: result.providerResults.at(-1)!.usage!.cost!.amount }),
      });
      setPhase("Validated draft ready");
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError")
        setError(
          "Generation was cancelled. Your brief and source material are preserved.",
        );
      else {
        if (
          reason instanceof AIProviderError &&
          reason.code === "credential-rejected"
        )
          setConnection({
            status: "unavailable",
            providerId: OPENROUTER_PROVIDER_ID,
            issue: "credential-rejected",
          });
        setError(
          reason instanceof AIProviderError
            ? reason.message
            : reason instanceof Error
              ? reason.message
              : "Course Factory could not generate a draft.",
        );
      }
      setPhase("Ready to retry");
    } finally {
      controller.current = undefined;
      setBusy(false);
    }
  };

  return (
    <main className="factory-page creation-tool-page">
      <header className="creation-tool-hero">
        <div>
          <p className="section-label">Creation · free</p>
          <h1>Course Factory</h1>
          <p>
            Turn a focused brief and source material into an editable MCF 1.1
            draft.
          </p>
        </div>
        <Status
          tone={connection.status === "connected" ? "positive" : "neutral"}
        >
          OpenRouter ·{" "}
          {connection.status === "connected" ? "connected" : "not connected"}
        </Status>
      </header>

      {connection.status !== "connected" ? (
        <section
          className="tool-callout"
          aria-labelledby="factory-connect-heading"
        >
          <div>
            <p className="section-label">Provider required</p>
            <h2 id="factory-connect-heading">Connect your compute provider</h2>
            <p>
              Factory uses your OpenRouter account. Studio and Batch Upload
              remain available without it.
            </p>
          </div>
          <LinkButton href="/settings/ai-providers">
            Connect OpenRouter
          </LinkButton>
        </section>
      ) : null}

      <div className="factory-layout">
        <form
          className="factory-form"
          onSubmit={(event) => event.preventDefault()}
        >
          <section className="creation-panel">
            <p className="section-label">01 · Course identity</p>
            <div className="field-grid two-column">
              <Field
                label="Title"
                value={brief.title}
                onChange={(event) => update("title", event.target.value)}
                required
              />
              <Field
                label="Subject or topic"
                value={brief.subject}
                onChange={(event) => update("subject", event.target.value)}
                required
              />
            </div>
            <Field
              label="Description"
              value={brief.description}
              onChange={(event) => update("description", event.target.value)}
            />
            <div className="field-grid two-column">
              <Field
                label="Intended learner or level"
                value={brief.learner}
                onChange={(event) => update("learner", event.target.value)}
              />
              <Field
                label="Curriculum or alignment context"
                value={brief.alignment}
                onChange={(event) => update("alignment", event.target.value)}
              />
            </div>
          </section>

          <section className="creation-panel">
            <p className="section-label">02 · Generation brief</p>
            <label className="field">
              <span>Creator instructions</span>
              <textarea
                rows={9}
                value={brief.instructions}
                onChange={(event) => update("instructions", event.target.value)}
                placeholder="Describe scope, learning goals, structure, tone, and what the draft should or should not include."
                required
              />
            </label>
          </section>

          <section className="creation-panel">
            <p className="section-label">03 · Source material</p>
            <label className="field">
              <span>Pasted text or Markdown</span>
              <textarea
                rows={10}
                value={brief.sourceMaterial}
                onChange={(event) =>
                  update("sourceMaterial", event.target.value)
                }
                placeholder="Optional notes, references, or source excerpts"
              />
            </label>
            <label className="button button-secondary">
              Add text or Markdown files
              <input
                type="file"
                multiple
                accept=".txt,.md,.markdown,text/plain,text/markdown"
                onChange={(event) => void addSourceFile(event)}
              />
            </label>
          </section>
        </form>

        <aside className="factory-run-panel creation-panel">
          <p className="section-label">Generate</p>
          <label className="field">
            <span>Provider</span>
            <select disabled>
              <option>OpenRouter</option>
            </select>
          </label>
          <label className="field">
            <span>Model</span>
            <select
              value={modelId}
              disabled={busy || !models.length}
              onChange={(event) => void chooseModel(event.target.value)}
            >
              {models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name} · {model.id}
                </option>
              ))}
            </select>
          </label>
          <p className="technical-note">
            This request is billed directly by OpenRouter. Theoria charges
            nothing.
          </p>
          <div className="factory-progress" aria-live="polite">
            <span>{phase}</span>
          </div>
          {error ? (
            <p className="form-message error-message" role="alert">
              {error}
            </p>
          ) : null}
          <div className="actions">
            <Button
              disabled={
                busy ||
                connection.status !== "connected" ||
                !modelId ||
                !brief.title.trim() ||
                !brief.subject.trim() ||
                !brief.instructions.trim()
              }
              onClick={() => void generate()}
            >
              {busy ? "Generating…" : "Generate course draft"}
            </Button>
            {busy ? (
              <Button
                className="button-secondary"
                onClick={() => controller.current?.abort()}
              >
                Cancel
              </Button>
            ) : null}
          </div>

          {draft ? (
            <article
              className="factory-result"
              aria-labelledby="factory-result-heading"
            >
              <Status tone="positive">Validated MCF 1.1</Status>
              <h2 id="factory-result-heading">{draft.title}</h2>
              <p>
                {draft.chapters} chapters · {draft.lessons} lessons ·{" "}
                {draft.attempts} generation attempt
                {draft.attempts === 1 ? "" : "s"}
              </p>
              {draft.cost !== undefined ? (
                <p>
                  Provider-reported cost: {draft.cost.toLocaleString()}{" "}
                  OpenRouter credits
                </p>
              ) : null}
              <p>
                <strong>AI-generated draft — review before publishing.</strong>
              </p>
              <LinkButton href={`/studio/${encodeURIComponent(draft.id)}`}>
                Open in Studio
              </LinkButton>
            </article>
          ) : null}
        </aside>
      </div>
    </main>
  );
}
