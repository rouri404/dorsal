// Routes, the same on the web and in the AppImage (served from app://):
//   /                 landing (Portuguese)     /en                 landing (English)
//   /app[/section]    configurator             /en/app[/section]   configurator
// Section slugs are in each language: /app/teclas, /en/app/keys.

import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import type { Lang } from "./i18n";

export type Section = "screen" | "keys" | "light" | "system" | "log";
export interface Route {
  lang: Lang;
  page: "landing" | "app";
  section: Section;
}

const SLUGS: Record<Lang, Record<Section, string>> = {
  pt: { screen: "tela", keys: "teclas", light: "iluminacao", system: "sistema", log: "log" },
  en: { screen: "screen", keys: "keys", light: "lighting", system: "system", log: "log" },
};

export function parse(path: string): Route {
  const parts = path.split("/").filter(Boolean);
  const lang: Lang = parts[0] === "en" ? "en" : "pt";
  if (parts[0] === "en" || parts[0] === "pt") parts.shift();
  if (parts[0] !== "app") return { lang, page: "landing", section: "screen" };
  const slug = parts[1];
  const section = (Object.keys(SLUGS[lang]) as Section[]).find((s) => SLUGS[lang][s] === slug) ?? "screen";
  return { lang, page: "app", section };
}

export function pathOf(r: Route): string {
  const prefix = r.lang === "en" ? "/en" : "";
  if (r.page === "landing") return prefix || "/";
  return `${prefix}/app/${SLUGS[r.lang][r.section]}`;
}

const EVENT = "x85:navigate";

interface NavigateOptions {
  /** Change the URL without a new history entry (in-page changes). */
  replace?: boolean;
  /** Crossfade the old page into the new one. */
  fade?: boolean;
  /** Stay at the same scroll position (the same page in another language). */
  keepScroll?: boolean;
}

export function navigate(path: string, options: NavigateOptions | boolean = {}) {
  const { replace = false, fade = false, keepScroll = false } = typeof options === "boolean" ? { replace: options } : options;
  const go = () => {
    const url = path + window.location.search + (keepScroll ? window.location.hash : "");
    if (replace) history.replaceState(null, "", url);
    else history.pushState(null, "", url);
    window.dispatchEvent(new Event(EVENT));
    if (!replace && !keepScroll) window.scrollTo({ top: 0, behavior: "instant" });
  };
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (fade && !reduce && "startViewTransition" in document) document.startViewTransition(go);
  else go();
}

export function useRoute(): Route {
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    // Synchronous, so a view transition captures the page already in its new state.
    const update = () => flushSync(() => setPath(window.location.pathname));
    window.addEventListener("popstate", update);
    window.addEventListener(EVENT, update);
    return () => {
      window.removeEventListener("popstate", update);
      window.removeEventListener(EVENT, update);
    };
  }, []);
  return parse(path);
}
