import DOMPurify from "dompurify";
import katex from "katex";
import { marked, Renderer, type Token } from "marked";
import type { ReaderLesson, ReaderStructure } from "./model";

export type AssetResolver = (path: string) => string | undefined;

export interface RenderedContent {
  readonly html: string;
  readonly hasRemoteResources: boolean;
}

const escape = (value: unknown): string =>
  String(value ?? "").replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        character
      ]!,
  );

const normalizedPath = (value: string): string | undefined => {
  if (
    !value ||
    value.includes("\\") ||
    value.startsWith("/") ||
    /^[A-Za-z]:/.test(value)
  )
    return undefined;
  const parts: string[] = [];
  for (const part of value.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) return undefined;
      parts.pop();
    } else parts.push(part);
  }
  return parts.join("/");
};

const dirname = (value: string): string =>
  value.split("/").slice(0, -1).join("/");

function resolveReference(
  source: string,
  lesson: ReaderLesson,
  course: ReaderStructure,
  resolveAsset: AssetResolver,
): { readonly url: string; readonly remote: boolean } {
  if (/^(?:https?:|youtube:)/i.test(source))
    return { url: source, remote: true };
  let path = source;
  if (source.startsWith("asset:")) {
    const asset = course.assets?.find((item) => item.id === source.slice(6));
    if (!asset) return { url: "#", remote: false };
    path = asset.source;
  } else {
    path = `${dirname(lesson.source)}/${source}`;
  }
  const normalized = normalizedPath(path);
  return {
    url: normalized ? (resolveAsset(normalized) ?? "#") : "#",
    remote: false,
  };
}

function youtubeVideoId(source: string): string | undefined {
  if (/^youtube:[A-Za-z0-9_-]+$/.test(source)) return source.slice(8);
  try {
    const url = new URL(source);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "youtu.be") return url.pathname.split("/").filter(Boolean)[0];
    if (
      ["youtube.com", "m.youtube.com", "youtube-nocookie.com"].includes(host)
    ) {
      if (url.pathname === "/watch")
        return url.searchParams.get("v") ?? undefined;
      return url.pathname.match(
        /^\/(?:embed|shorts|live)\/([A-Za-z0-9_-]+)/,
      )?.[1];
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function withMath(source: string, renderer: Renderer): string {
  const expressions: Array<{
    readonly source: string;
    readonly displayMode: boolean;
  }> = [];
  let prefix = "MCFMATHPLACEHOLDER";
  while (source.includes(prefix)) prefix += "_";
  const placeholder = (value: string, displayMode: boolean) => {
    const index = expressions.push({ source: value, displayMode }) - 1;
    return `${prefix}${index}END`;
  };
  const tokens = marked.lexer(source, { async: false, gfm: true });
  marked.walkTokens(tokens, (token: Token) => {
    if (token.type !== "text") return;
    token.text = token.text
      .replace(/\$\$([\s\S]*?)\$\$/g, (_match: string, value: string) =>
        placeholder(value.trim(), true),
      )
      .replace(/(?<!\\)\$([^\n$]+)\$/g, (_match: string, value: string) =>
        placeholder(value, false),
      );
  });
  return marked
    .parser(tokens, { renderer, gfm: true })
    .replace(new RegExp(`${prefix}(\\d+)END`, "g"), (_match, index: string) => {
      const expression = expressions[Number(index)]!;
      return katex.renderToString(expression.source, {
        displayMode: expression.displayMode,
        throwOnError: false,
      });
    });
}

export function renderRichContent(
  source: string,
  lesson: ReaderLesson,
  course: ReaderStructure,
  resolveAsset: AssetResolver,
): RenderedContent {
  let hasRemoteResources = false;
  const mediaSource = source.replace(
    /@\[(audio|video)\]\((\S+)(?:\s+"([^"]*)")?\)/g,
    (_all, kind: "audio" | "video", reference: string, label?: string) => {
      const youtube = kind === "video" ? youtubeVideoId(reference) : undefined;
      if (youtube) {
        hasRemoteResources = true;
        return `<figure class="remote-media"><a href="https://www.youtube.com/watch?v=${escape(youtube)}" target="_blank" rel="noopener noreferrer">Open ${escape(label || "video")} on YouTube</a><figcaption>Remote media — internet required.</figcaption></figure>`;
      }
      const resolved = resolveReference(
        reference,
        lesson,
        course,
        resolveAsset,
      );
      hasRemoteResources ||= resolved.remote;
      return `<figure><${kind} controls preload="metadata" src="${escape(resolved.url)}"></${kind}>${label ? `<figcaption>${escape(label)}</figcaption>` : ""}${resolved.remote ? "<small>Remote media — internet required and is not cached.</small>" : ""}</figure>`;
    },
  );
  const renderer = new Renderer();
  renderer.image = ({ href, title, text }) => {
    const resolved = resolveReference(href, lesson, course, resolveAsset);
    hasRemoteResources ||= resolved.remote;
    return `<img src="${escape(resolved.url)}" alt="${escape(text)}"${title ? ` title="${escape(title)}"` : ""} loading="lazy">`;
  };
  renderer.link = ({ href, title, tokens }) => {
    const remote = /^(?:https?:|mailto:)/i.test(href);
    const resolved =
      remote || href.startsWith("#")
        ? { url: href, remote }
        : resolveReference(href, lesson, course, resolveAsset);
    hasRemoteResources ||= resolved.remote;
    return `<a href="${escape(resolved.url)}"${title ? ` title="${escape(title)}"` : ""}${remote ? ' target="_blank" rel="noopener noreferrer"' : ""}>${renderer.parser.parseInline(tokens)}</a>`;
  };
  const rendered = withMath(mediaSource, renderer);
  const html = DOMPurify.sanitize(rendered, {
    ALLOWED_URI_REGEXP:
      /^(?:(?:https?|mailto|blob):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
    ADD_TAGS: [
      "audio",
      "video",
      "source",
      "figure",
      "figcaption",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
    ],
    ADD_ATTR: [
      "controls",
      "preload",
      "src",
      "alt",
      "title",
      "loading",
      "target",
      "rel",
      "class",
      "style",
      "aria-hidden",
    ],
    ALLOW_DATA_ATTR: false,
  });
  return { html, hasRemoteResources };
}
