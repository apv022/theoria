import { StudioDraftWorkspace } from "../../../../components/studio-draft-workspace";
import type { Metadata } from "next";

interface Props {
  readonly params: Promise<{ draftId: string }>;
}
export const metadata: Metadata = { title: "Draft workspace" };

export default async function DraftPage({ params }: Props) {
  const { draftId } = await params;
  return <StudioDraftWorkspace draftId={draftId} />;
}
