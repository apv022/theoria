"use client";

import { useEffect, useState } from "react";

const paletteFor = (value: string): number => {
  let hash = 0;
  for (const character of value)
    hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return Math.abs(hash) % 6;
};

const initialsFor = (title: string): string => {
  const words = title.trim().split(/\s+/).filter(Boolean);
  return (
    (words.length > 1
      ? `${words[0]?.[0]}${words[1]?.[0]}`
      : words[0]?.slice(0, 2)
    )?.toUpperCase() || "LP"
  );
};

export function PackageCover({
  src,
  title,
  kind,
  stableId,
  className = "",
}: {
  readonly src?: string | undefined;
  readonly title: string;
  readonly kind?: string | undefined;
  readonly stableId: string;
  readonly className?: string | undefined;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const showImage = Boolean(src) && !failed;

  return (
    <div
      className={`course-cover ${className}`.trim()}
      data-palette={paletteFor(stableId)}
      aria-hidden="true"
    >
      {showImage ? (
        // Package covers can be object URLs and authenticated API responses.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" onError={() => setFailed(true)} />
      ) : (
        <div className="package-cover-fallback">
          <span>{initialsFor(title)}</span>
          <small>{kind?.replaceAll("_", " ") || "Learning package"}</small>
        </div>
      )}
    </div>
  );
}
