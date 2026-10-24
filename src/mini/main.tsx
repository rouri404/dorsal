import { StrictMode } from "react";
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
// ?lang=pt|en, otherwise the system's language.
const asked = new URLSearchParams(window.location.search).get("lang");
const lang: Lang = asked === "pt" || asked === "en" ? asked : browserLang();
document.documentElement.lang = lang === "en" ? "en" : "pt-BR";
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LangContext.Provider value={lang}>
      <DeviceProvider parts={[]}>
        <MiniApp />
      </DeviceProvider>
    </LangContext.Provider>
  </StrictMode>,
);
