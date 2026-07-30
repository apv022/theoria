"use client";

import { IndexedDbLocalStore, type SyncCategory } from "@theoria/local-store";
import { syncStatusLabel } from "@theoria/sync";
import { Status } from "@theoria/ui";
import { useEffect, useState } from "react";

const store =
  typeof indexedDB === "undefined" ? undefined : new IndexedDbLocalStore();

export function SyncStatus({
  category,
  stableId,
}: {
  readonly category: SyncCategory;
  readonly stableId: string;
}) {
  const [label, setLabel] = useState<
    "Local only" | "Waiting to sync" | "Synced" | "Conflict" | "Sync failed"
  >("Local only");

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      if (!store) return;
      const [settings, record, conflicts] = await Promise.all([
        store.sync.settings(),
        store.sync.record(category, stableId),
        store.sync.conflicts(),
      ]);
      if (!active) return;
      setLabel(
        conflicts.some(
          (conflict) =>
            conflict.category === category && conflict.stableId === stableId,
        )
          ? "Conflict"
          : syncStatusLabel(record, settings.enabled),
      );
    };
    const changed = () => void refresh();
    void refresh();
    addEventListener("theoria-sync-change", changed);
    return () => {
      active = false;
      removeEventListener("theoria-sync-change", changed);
    };
  }, [category, stableId]);

  return (
    <Status
      tone={
        label === "Synced"
          ? "positive"
          : label === "Sync failed" || label === "Conflict"
            ? "warning"
            : "neutral"
      }
    >
      {label}
    </Status>
  );
}
