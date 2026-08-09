"use client";

import type { RepositorySubject } from "@theoria/platform-client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";

const setParameter = (
  current: URLSearchParams,
  name: string,
  value: string,
): string => {
  const next = new URLSearchParams(current);
  if (value) next.set(name, value);
  else next.delete(name);
  next.delete("page");
  const query = next.toString();
  return `/explore${query ? `?${query}` : ""}`;
};

export function ExploreControls({
  query,
  subjects,
}: {
  readonly query: Readonly<Record<string, string | undefined>>;
  readonly subjects: readonly RepositorySubject[];
}) {
  const router = useRouter();
  const parameters = useSearchParams();
  const [text, setText] = useState(query.q ?? "");
  const [level, setLevel] = useState(query.level ?? "");
  const [language, setLanguage] = useState(query.language ?? "");
  const [offline, setOffline] = useState(false);
  const [pending, startTransition] = useTransition();
  const firstPage = useRef(true);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    addEventListener("online", update);
    addEventListener("offline", update);
    return () => {
      removeEventListener("online", update);
      removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => setText(query.q ?? ""), [query.q]);
  useEffect(() => setLevel(query.level ?? ""), [query.level]);
  useEffect(() => setLanguage(query.language ?? ""), [query.language]);

  useEffect(() => {
    if (firstPage.current) {
      firstPage.current = false;
      return;
    }
    document.querySelector<HTMLElement>("#repository-results")?.focus();
  }, [parameters]);

  const update = (name: string, value: string) =>
    startTransition(() =>
      router.replace(setParameter(parameters, name, value), { scroll: false }),
    );

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = new URLSearchParams(parameters);
    const submitted: readonly (readonly [string, string])[] = [
      ["q", text.trim()],
      ["level", level.trim()],
      ["language", language.trim()],
    ];
    for (const [name, value] of submitted) {
      if (value) next.set(name, value);
      else next.delete(name);
    }
    next.delete("page");
    const serialized = next.toString();
    startTransition(() =>
      router.push(`/explore${serialized ? `?${serialized}` : ""}`, {
        scroll: false,
      }),
    );
  };

  const selectedSubject = query.subject ?? "";
  const visibleSubjects = selectedSubject
    ? [
        ...subjects,
        ...(subjects.some((item) => item.value === selectedSubject)
          ? []
          : [{ value: selectedSubject, packageCount: 0 }]),
      ]
    : subjects;
  const advancedActive = Boolean(query.kind || query.mcf);

  return (
    <>
      {offline ? (
        <p className="repository-offline" role="alert">
          You are offline. Local Library and Reader packages remain available,
          but repository results cannot refresh.
        </p>
      ) : null}
      <form
        id="search"
        className="repository-controls"
        role="search"
        onSubmit={submit}
      >
        <label className="field repository-query">
          <span>Search courses and learning resources</span>
          <input
            name="q"
            type="search"
            value={text}
            maxLength={160}
            placeholder="Title, description, subject, keyword, or creator"
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Subject</span>
          <select
            value={selectedSubject}
            onChange={(event) => update("subject", event.target.value)}
          >
            <option value="">All subjects</option>
            {visibleSubjects.map((subject) => (
              <option key={subject.value} value={subject.value}>
                {subject.value}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Level</span>
          <input
            value={level}
            placeholder="Any level"
            onChange={(event) => setLevel(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Language</span>
          <input
            value={language}
            placeholder="Language code, for example en or fr-CA"
            onChange={(event) => setLanguage(event.target.value)}
          />
        </label>
        <details
          className="repository-advanced"
          open={advancedActive || undefined}
        >
          <summary>More filters{advancedActive ? " · active" : ""}</summary>
          <div>
            <label className="field">
              <span>Content type</span>
              <select
                value={query.kind ?? ""}
                onChange={(event) => update("kind", event.target.value)}
              >
                <option value="">All content types</option>
                <option value="course">Course</option>
                <option value="module">Module</option>
                <option value="lesson">Lesson</option>
                <option value="question_bank">Question bank</option>
                <option value="asset_collection">Asset collection</option>
              </select>
            </label>
            <label className="field">
              <span>Format version</span>
              <select
                value={query.mcf ?? ""}
                onChange={(event) => update("mcf", event.target.value)}
              >
                <option value="">All format versions</option>
                <option value="1.1">MCF 1.1</option>
                <option value="1.0">MCF 1.0</option>
              </select>
            </label>
          </div>
        </details>
        <label className="field">
          <span>Sort</span>
          <select
            value={query.sort ?? (query.q ? "relevance" : "newest")}
            onChange={(event) => update("sort", event.target.value)}
          >
            <option value="relevance">Relevance</option>
            <option value="newest">Newest</option>
            <option value="updated">Recently updated</option>
            <option value="title">Title</option>
          </select>
        </label>
        <div className="repository-control-actions">
          <button className="button" type="submit" aria-busy={pending}>
            {pending ? "Searching…" : "Search"}
          </button>
          <Link className="button button-secondary" href="/explore">
            Clear filters
          </Link>
        </div>
      </form>
      <p className="sr-only" role="status" aria-live="polite">
        {pending ? "Loading repository results" : "Repository results loaded"}
      </p>
    </>
  );
}
