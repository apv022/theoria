import Link from "next/link";

const pageHref = (
  pathname: string,
  values: Readonly<Record<string, string | undefined>>,
  page: number,
) => {
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    if (value && key !== "page") parameters.set(key, value);
  if (page > 1) parameters.set("page", String(page));
  const query = parameters.toString();
  return `${pathname}${query ? `?${query}` : ""}#repository-results`;
};

export function RepositoryPagination({
  pathname,
  query,
  page,
  totalPages,
}: {
  readonly pathname: string;
  readonly query: Readonly<Record<string, string | undefined>>;
  readonly page: number;
  readonly totalPages: number;
}) {
  if (totalPages < 2) return null;
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, page + 2);
  const pages = Array.from({ length: end - start + 1 }, (_, index) => {
    return start + index;
  });
  return (
    <nav className="repository-pagination" aria-label="Result pages">
      {page > 1 ? (
        <Link rel="prev" href={pageHref(pathname, query, page - 1)}>
          Previous
        </Link>
      ) : (
        <span aria-disabled="true">Previous</span>
      )}
      {pages.map((value) => (
        <Link
          key={value}
          href={pageHref(pathname, query, value)}
          aria-current={value === page ? "page" : undefined}
        >
          {value}
        </Link>
      ))}
      {page < totalPages ? (
        <Link rel="next" href={pageHref(pathname, query, page + 1)}>
          Next
        </Link>
      ) : (
        <span aria-disabled="true">Next</span>
      )}
    </nav>
  );
}
