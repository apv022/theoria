import Link from "next/link";
import { AppShell } from "../../components/app-shell";

export default function OfflinePage() {
  return (
    <AppShell>
      <div className="reader-error">
        <p className="section-label">Offline</p>
        <h1>This page has not been cached yet.</h1>
        <p>
          Return to your local library. Reader pages you opened while online are
          available after the application shell has finished caching.
        </p>
        <Link className="button" href="/library">
          Open local library
        </Link>
      </div>
    </AppShell>
  );
}
