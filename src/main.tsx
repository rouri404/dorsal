import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DeviceProvider } from "./device";
import { Configurator } from "./app/Configurator";
import { LandingApp } from "./landing/LandingApp";
import { LangContext } from "./i18n";
import { pathOf, useRoute } from "./router";
import { SITE } from "./brand";
import { uploadJob } from "./screen/uploadJob";
import "./styles.css";

// Screenshot aid (see electron/main.cjs): show an upload in progress without uploading.
const previewUpload = new URLSearchParams(window.location.search).get("previewUpload");
if (previewUpload !== null) {
  uploadJob.start("…");
  uploadJob.progress(Number(previewUpload) || 0.42);
}

function Root() {
  const route = useRoute();
  document.documentElement.lang = route.lang === "en" ? "en" : "pt-BR";
  document.querySelector('link[rel="canonical"]')?.setAttribute("href", SITE + pathOf(route));
  return (
    <LangContext.Provider value={route.lang}>
      {route.page === "landing" ? (
        <LandingApp />
      ) : (
        <DeviceProvider>
          <Configurator section={route.section} />
        </DeviceProvider>
      )}
    </LangContext.Provider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
