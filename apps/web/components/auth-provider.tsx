"use client";

import type {
  AccountIdentity,
  AuthEvent,
  PlatformClient,
} from "@theoria/platform-client";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { browserPlatformClient } from "../lib/platform/browser";

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
