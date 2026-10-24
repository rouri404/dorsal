// Two languages, Portuguese and English. Texts are written in place as tr("pt", "en"),
// so each string sits next to its translation; protocol names go through ./labels.

import { createContext, useContext } from "react";

export type Lang = "pt" | "en";

export const LangContext = createContext<Lang>("pt");

export const useLang = () => useContext(LangContext);

/** `tr("Tela", "Screen")`: the text in the current language. */
export function useTr() {
  const lang = useLang();
  return (pt: string, en: string) => (lang === "en" ? en : pt);
}

/** The browser's language when the URL does not say. */
export const browserLang = (): Lang => (navigator.language?.toLowerCase().startsWith("pt") ? "pt" : "en");
