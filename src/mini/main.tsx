import { StrictMode, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { DeviceProvider } from "../device";
import { MiniApp } from "./MiniApp";
import { uploadJob } from "../screen/uploadJob";
import { LangContext, browserLang, type Lang } from "../i18n";
import "../styles.css";

// Screenshot aid (see electron/main.cjs): show an upload in progress without uploading.
const previewUpload = new URLSearchParams(window.location.search).get("previewUpload");
if (previewUpload !== null) {
  uploadJob.start("Enviando imagem");
  uploadJob.progress(Number(previewUpload) || 0.42);
}

// The widget is always dark; it reads no settings, only the screen.
if (!navigator.userAgent.includes("Electron")) document.body.classList.add("mini-web");
// ?lang=pt|en (X85_LANG in the AppImage), otherwise the last one picked, otherwise the system's.
const LANG_KEY = "dorsal.mini.lang";
const isLang = (v: string | null): v is Lang => v === "pt" || v === "en";
const stored = (): string | null => {
  try {
    return localStorage.getItem(LANG_KEY);
  } catch {
    return null;
  }
};
const asked = new URLSearchParams(window.location.search).get("lang");
const remembered = stored();
const first: Lang = isLang(asked) ? asked : isLang(remembered) ? remembered : browserLang();

function Root() {
  const [lang, setLang] = useState<Lang>(first);
  useEffect(() => {
    document.documentElement.lang = lang === "en" ? "en" : "pt-BR";
  }, [lang]);
  const pick = (l: Lang) => {
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {
      // Not remembered, still switched.
    }
    // Crossfade, as the site does when switching language.
    if (document.startViewTransition) document.startViewTransition(() => flushSync(() => setLang(l)));
    else setLang(l);
  };
  return (
    <LangContext.Provider value={lang}>
      <DeviceProvider parts={[]}>
        <MiniApp onLang={pick} />
      </DeviceProvider>
    </LangContext.Provider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
