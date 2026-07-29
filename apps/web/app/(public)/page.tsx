import { LinkButton, Status } from "@theoria/ui";

const principles = [
  {
    number: "01",
    title: "Bring the package.",
    body: "MCF learning packages stay portable. Import locally, inspect the source, and keep control of the archive.",
  },
  {
    number: "02",
    title: "Learn without a gate.",
    body: "Reading and progress belong in the browser first. An account becomes useful when sharing is useful.",
  },
  {
    number: "03",
    title: "Publish deliberately.",
    body: "Creation, validation, preview, and export form one focused workspace—not a collection of disconnected tools.",
  },
] as const;

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <div className="eyebrow">
          <span /> Repository-first learning
        </div>
        <h1>
          Learning packages
          <br />
          with somewhere to <em>live.</em>
        </h1>
        <p className="hero-copy">
          Theoria is a home for discovering, reading, creating, and publishing
          portable MCF courses—without surrendering the source.
        </p>
        <div className="actions">
          <LinkButton href="/explore">
            Explore packages <span aria-hidden="true">→</span>
          </LinkButton>
          <LinkButton href="/studio" secondary>
            Open the studio
          </LinkButton>
        </div>
        <div className="hero-note">
          <Status tone="positive">Local-first</Status>
          <span>No account required for browser-owned work</span>
        </div>
      </section>

      <section className="statement">
        <p className="section-label">A durable foundation</p>
        <h2>
          The package is the product.
          <br />
          The platform helps it travel.
        </h2>
        <div className="principle-grid">
          {principles.map((principle) => (
            <article className="principle" key={principle.number}>
              <span>{principle.number}</span>
              <h3>{principle.title}</h3>
              <p>{principle.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="workspace-band">
        <div>
          <p className="section-label">Three rooms, clear doors</p>
          <h2>
            One platform.
            <br />
            Focused workspaces.
          </h2>
        </div>
        <div className="workspace-list">
          <a href="/library">
            <span>Learning</span>
            <strong>Library & focused reader</strong>
            <i aria-hidden="true">↗</i>
          </a>
          <a href="/studio">
            <span>Creation</span>
            <strong>Author, validate & export</strong>
            <i aria-hidden="true">↗</i>
          </a>
          <div>
            <span>Institutional</span>
            <strong>Purposefully separate</strong>
            <Status>Later</Status>
          </div>
        </div>
      </section>
    </>
  );
}
