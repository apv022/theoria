import { LinkButton, Notice, Status } from "@theoria/ui";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Studio" };

export default function StudioPage() {
  return (
    <div className="studio-home">
      <header>
        <p className="section-label">Creation workspace</p>
        <h1>
          Make something
          <br />
          that can travel.
        </h1>
        <p>
          Authoring remains staged; the dedicated compiler is ready for package
          validation and output.
        </p>
      </header>
      <div className="studio-options">
        <article>
          <span>01</span>
          <h2>New package</h2>
          <p>Start from an MCF 1.1 course, module, or lesson.</p>
          <Status tone="warning">Not implemented</Status>
        </article>
        <article>
          <span>02</span>
          <h2>Compile source</h2>
          <p>
            Import, validate, compile, preview, and preserve an existing
            package.
          </p>
          <LinkButton href="/compile" secondary>
            Open compiler
          </LinkButton>
        </article>
        <article>
          <span>03</span>
          <h2>Workspace preview</h2>
          <p>See the separated authoring shell and validation rail.</p>
          <LinkButton href="/studio/foundation-preview" secondary>
            Open preview
          </LinkButton>
        </article>
      </div>
      <Notice title="Authoring is still staged">
        The browser compiler is a separate working tool. Full draft editing and
        publishing remain deferred until their local document and platform
        boundaries are implemented.
      </Notice>
    </div>
  );
}
