"use client";

import { useEffect, useRef, useState } from "react";

export function OfflineRegistration() {
  const [offline, setOffline] = useState(false);
  const [update, setUpdate] = useState<ServiceWorker | undefined>();
  const [registrationError, setRegistrationError] = useState(false);
  const updateRequested = useRef(false);

  useEffect(() => {
    let active = true;
    const updateConnectivity = () => setOffline(!navigator.onLine);
    updateConnectivity();
    window.addEventListener("online", updateConnectivity);
    window.addEventListener("offline", updateConnectivity);
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      let reloading = false;
      const changed = () => {
        if (!updateRequested.current || reloading) return;
        reloading = true;
        location.reload();
      };
      navigator.serviceWorker.addEventListener("controllerchange", changed);
      void navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((registration) => {
          if (active && registration.waiting) setUpdate(registration.waiting);
          registration.addEventListener("updatefound", () => {
            const worker = registration.installing;
            worker?.addEventListener("statechange", () => {
              if (
                active &&
                worker.state === "installed" &&
                navigator.serviceWorker.controller
              ) {
                setUpdate(worker);
              }
            });
          });
        })
        .catch(() => {
          if (active) setRegistrationError(true);
        });
      return () => {
        active = false;
        window.removeEventListener("online", updateConnectivity);
        window.removeEventListener("offline", updateConnectivity);
        navigator.serviceWorker.removeEventListener(
          "controllerchange",
          changed,
        );
      };
    }
    return () => {
      active = false;
      window.removeEventListener("online", updateConnectivity);
      window.removeEventListener("offline", updateConnectivity);
    };
  }, []);

  return (
    <div className="runtime-notices" aria-live="polite">
      {offline ? (
        <p className="offline-banner" role="status">
          Offline — Library, Reader progress, and Studio drafts remain local.
        </p>
      ) : null}
      {update ? (
        <p className="update-banner" role="status">
          An application update is ready.
          <button
            type="button"
            onClick={() => {
              updateRequested.current = true;
              update.postMessage({ type: "SKIP_WAITING" });
            }}
          >
            Update now
          </button>
          <button type="button" onClick={() => setUpdate(undefined)}>
            Later
          </button>
        </p>
      ) : null}
      {registrationError ? (
        <p className="sr-only" role="status">
          Offline installation is unavailable; the application remains usable
          online.
        </p>
      ) : null}
    </div>
  );
}
