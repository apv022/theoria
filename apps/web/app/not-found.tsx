import { LinkButton } from "@theoria/ui";

export default function NotFound() {
  return (
    <main id="main" className="not-found">
      <span>404</span>
      <h1>Nothing lives here yet.</h1>
      <p>The package or page could not be found.</p>
      <LinkButton href="/">Return home</LinkButton>
    </main>
  );
}
