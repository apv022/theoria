"use client";

import type { RepositorySubject } from "@theoria/platform-client";
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
  const [offline, setOffline] = useState(false);
  const [pending, startTransition] = useTransition();
  const firstPage = useRef(true);
  const firstQuery = useRef(true);

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

  useEffect(() => {
    if (firstQuery.current) {
      firstQuery.current = false;
      return;
    }
    const timer = setTimeout(() => {
      if (text === (parameters.get("q") ?? "")) return;
      startTransition(() =>
        router.replace(setParameter(parameters, "q", text.trim()), {
          scroll: false,
        }),
      );
    }, 350);
    return () => clearTimeout(timer);
  }, [parameters, router, text]);

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
    update("q", text.trim());
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
          <span>Search packages</span>
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
            value={query.level ?? ""}
            placeholder="Any level"
            onChange={(event) => update("level", event.target.value.trim())}
          />
        </label>
        <label className="field">
          <span>Language</span>
          <input
            value={query.language ?? ""}
            placeholder="Any BCP 47 language"
            onChange={(event) => update("language", event.target.value.trim())}
          />
        </label>
        <label className="field">
          <span>Package kind</span>
          <select
            value={query.kind ?? ""}
            onChange={(event) => update("kind", event.target.value)}
          >
            <option value="">All kinds</option>
            <option value="course">Course</option>
            <option value="module">Module</option>
            <option value="lesson">Lesson</option>
            <option value="question_bank">Question bank</option>
            <option value="asset_collection">Asset collection</option>
          </select>
        </label>
        <label className="field">
          <span>MCF version</span>
          <select
            value={query.mcf ?? ""}
            onChange={(event) => update("mcf", event.target.value)}
          >
            <option value="">All MCF versions</option>
            <option value="1.1">MCF 1.1</option>
            <option value="1.0">MCF 1.0</option>
          </select>
        </label>
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
          <button className="button" type="submit">
            Search
          </button>
          <a className="button button-secondary" href="/explore">
            Clear filters
          </a>
        </div>
      </form>
      <p className="sr-only" role="status" aria-live="polite">
        {pending ? "Loading repository results" : "Repository results loaded"}
      </p>
    </>
  );
}
