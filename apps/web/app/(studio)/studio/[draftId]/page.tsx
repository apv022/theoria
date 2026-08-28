import { StudioDraftWorkspace } from "../../../../components/studio-draft-workspace";
import { CreationToolNavigation } from "../../../../components/creation-tool-navigation";
import type { Metadata } from "next";

interface Props {
  readonly params: Promise<{ draftId: string }>;
}
export const metadata: Metadata = { title: "Draft workspace" };

export default async function DraftPage({ params }: Props) {
  const { draftId } = await params;
  return (
    <div className="creation-studio-page">
      <CreationToolNavigation />
      <StudioDraftWorkspace draftId={draftId} />
    </div>
  );
}
