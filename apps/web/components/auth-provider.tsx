"use client";

import type {
  AccountIdentity,
  AuthEvent,
  PlatformClient,
} from "@theoria/platform-client";
import { IndexedDbLocalStore } from "@theoria/local-store";
import { TheoriaSyncEngine } from "@theoria/sync";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { browserPlatformClient } from "../lib/platform/browser";

const localStore =
  typeof indexedDB === "undefined" ? undefined : new IndexedDbLocalStore();

interface AuthContextValue {
  readonly platform: PlatformClient;
  readonly configured: boolean;
  readonly loading: boolean;
  readonly identity: AccountIdentity | null;
  readonly event: AuthEvent;
  readonly reload: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { readonly children: ReactNode }) {
  const platform = useMemo(() => browserPlatformClient(), []);
  const [identity, setIdentity] = useState<AccountIdentity | null>(null);
  const [event, setEvent] = useState<AuthEvent>("initial");
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    const next = await platform.authentication.currentIdentity();
    setIdentity(next);
    setEvent(next ? "signed-in" : "signed-out");
    setLoading(false);
  };

  useEffect(() => {
    let active = true;
    void platform.authentication
      .currentIdentity()
      .then((next) => {
        if (!active) return;
        setIdentity(next);
        setEvent(next ? "signed-in" : "signed-out");
      })
      .catch(() => {
        if (!active) return;
        setIdentity(null);
        setEvent("expired");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const unsubscribe = platform.authentication.subscribe((change) => {
      if (!active) return;
      setIdentity(change.identity);
      setEvent(change.event);
      setLoading(false);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [platform]);

  useEffect(() => {
    if (!localStore) return;
    let active = true;
    let running = false;
    let rerun = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      if (!active) return;
      if (running) {
        rerun = true;
        return;
      }
      const settings = await localStore.sync.settings();
      if (!settings.enabled || settings.pausedReason === "user") return;
      if (!navigator.onLine) {
        if (settings.pausedReason !== "offline")
          await localStore.sync.configure({ pausedReason: "offline" });
        return;
      }
      let activeIdentity = identity;
      if (!activeIdentity || event === "expired") {
        try {
          activeIdentity = await platform.authentication.currentIdentity();
        } catch {
          activeIdentity = null;
        }
        if (!activeIdentity) {
          if (settings.pausedReason !== "expired")
            await localStore.sync.configure({ pausedReason: "expired" });
          return;
        }
        setIdentity(activeIdentity);
        setEvent("signed-in");
      }
      running = true;
      try {
        await new TheoriaSyncEngine(localStore.sync, platform.sync).syncNow();
      } catch {
        // The durable outbox remains available for a later bounded retry.
      } finally {
        running = false;
        if (rerun) {
          rerun = false;
          schedule();
        }
      }
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void run(), 500);
    };
    const retryTimer = setInterval(schedule, 2_000);
    addEventListener("online", schedule);
    addEventListener("theoria-sync-change", schedule);
    schedule();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      clearInterval(retryTimer);
      removeEventListener("online", schedule);
      removeEventListener("theoria-sync-change", schedule);
    };
  }, [event, identity, platform]);

  return (
    <AuthContext.Provider
      value={{
        platform,
        configured: platform.authentication.configured,
        loading,
        identity,
        event,
        reload,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider.");
  return value;
}
