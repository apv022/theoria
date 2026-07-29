import { Button, Field, Status } from "@theoria/ui";
import type { Metadata } from "next";

interface Props {
  readonly params: Promise<{ draftId: string }>;
}
export const metadata: Metadata = { title: "Draft workspace" };

export default async function DraftPage({ params }: Props) {
  const { draftId } = await params;
  return (
    <div className="draft-grid">
      <aside className="draft-tree">
        <p className="section-label">Package tree</p>
        <strong>{draftId}</strong>
        <ul>
          <li>manifest.yaml</li>
          <li>chapters/</li>
          <li className="muted">No source loaded</li>
        </ul>
      </aside>
      <section className="draft-editor">
        <div className="draft-title">
          <div>
            <p>Manifest</p>
            <h1>Package details</h1>
          </div>
          <Status tone="warning">Uninitialized</Status>
        </div>
        <Field label="Title" value="Foundation preview" readOnly />
        <Field label="MCF version" value="1.1" readOnly />
        <label className="field">
          <span>Description</span>
          <textarea
            value="This form is a non-editing layout preview."
            readOnly
          />
        </label>
        <Button disabled>Validate package</Button>
      </section>
      <aside className="validation-rail">
        <p className="section-label">Validation</p>
        <div className="validation-empty">
          <span aria-hidden="true">◇</span>
          <strong>No result</strong>
          <p>
            The MCF engine has not been initialized. No validation was
            attempted.
          </p>
        </div>
      </aside>
    </div>
  );
}
