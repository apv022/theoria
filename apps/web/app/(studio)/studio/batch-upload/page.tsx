import type { Metadata } from "next";
import { BatchUpload } from "../../../../components/batch-upload";
import { CreationToolNavigation } from "../../../../components/creation-tool-navigation";

export const metadata: Metadata = { title: "Batch Upload" };

export default function BatchUploadPage() {
  return (
    <div className="creation-studio-page">
      <CreationToolNavigation />
      <BatchUpload />
    </div>
  );
}
