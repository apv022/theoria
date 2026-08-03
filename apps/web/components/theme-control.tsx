"use client";

import { useEffect, useState } from "react";

export type ThemePreference = "light" | "dark" | "system";

export const themeStorageKey = "theoria-theme";

const applyTheme = (preference: ThemePreference) => {
  const dark =
    preference === "dark" ||
    (preference === "system" &&
      matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
};

export function ThemeControl({
  compact = false,
}: {
  readonly compact?: boolean;
}) {
  const [preference, setPreference] = useState<ThemePreference>("system");

  useEffect(() => {
    const saved = localStorage.getItem(themeStorageKey);
    const initial =
      saved === "light" || saved === "dark" || saved === "system"
        ? saved
        : "system";
    setPreference(initial);
    applyTheme(initial);
    const media = matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      if ((localStorage.getItem(themeStorageKey) ?? "system") === "system")
        applyTheme("system");
    };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const dark = preference === "dark";
  return compact ? (
    <button
      className="theme-icon-control"
      type="button"
      aria-label={`Theme: ${dark ? "switch to light mode" : "switch to dark mode"}`}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => {
        const next = dark ? "light" : "dark";
        localStorage.setItem(themeStorageKey, next);
        setPreference(next);
        applyTheme(next);
      }}
    >
      {dark ? "☀" : "☾"}
    </button>
  ) : (
    <label className="theme-control">
      <span>Appearance</span>
      <select
        aria-label="Theme"
        value={preference}
        onChange={(event) => {
          const next = event.target.value as ThemePreference;
          localStorage.setItem(themeStorageKey, next);
          setPreference(next);
          applyTheme(next);
        }}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
