// Search and link-preview metadata, shared by the build (static HTML per route, in
// vite.config.ts) and the browser (the head follows client-side navigation, in src/main.tsx).

export type SeoLang = "pt" | "en";
export type SeoPage = "landing" | "app";

export const AUTHOR = { name: "Gabriel Couto", alternateName: "rouri404", url: "https://cotoo.dev", github: "https://github.com/rouri404" };

interface Meta {
  /** Path of the page in this language. */
  path: string;
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
  image: string;
  imageAlt: string;
  locale: string;
  robots: string;
}

const LANDING: Record<SeoLang, Meta> = {
  pt: {
    path: "/",
    title: "Dorsal: configurador do Attack Shark X85 Pro no Linux",
    description:
      "Configure o Attack Shark X85 Pro no Linux sem driver: GIF na tela TFT, RGB, remapeamento de teclas e regra udev. Grátis, via WebHID ou AppImage.",
    ogTitle: "O seu X85 Pro, configurado no Linux · Dorsal",
    ogDescription: "Imagens e GIFs na tela TFT, teclas, iluminação RGB e bateria do Attack Shark X85 Pro, sem Windows e sem driver.",
    image: "/og-pt.png",
    imageAlt: "O teclado Attack Shark X85 Pro em 3D, com a iluminação ligada, ao lado do título Dorsal.",
    locale: "pt_BR",
    robots: "index, follow",
  },
  en: {
    path: "/en",
    title: "Dorsal: Attack Shark X85 Pro configurator for Linux",
    description:
      "Configure the Attack Shark X85 Pro on Linux without the vendor driver: GIFs on the TFT screen, RGB, key remapping and udev rules. Free, via WebHID or AppImage.",
    ogTitle: "Your X85 Pro, configured on Linux · Dorsal",
    ogDescription: "Images and GIFs on the TFT screen, keys, RGB lighting and battery of the Attack Shark X85 Pro, with no Windows and no driver.",
    image: "/og.png",
    imageAlt: "The Attack Shark X85 Pro keyboard in 3D, lit up, next to the Dorsal title.",
    locale: "en_US",
    robots: "index, follow",
  },
};

// The configurator needs the keyboard plugged in and says little to a crawler: kept out of the
// index so it does not compete with the landing page, while its links are still followed.
const APP: Record<SeoLang, Meta> = {
  pt: {
    ...LANDING.pt,
    path: "/app",
    title: "Dorsal · Configurador do Attack Shark X85 Pro",
    description: "Configure o Attack Shark X85 Pro pelo navegador: tela TFT, teclas, iluminação RGB e sistema, via WebHID.",
    robots: "noindex, follow",
  },
  en: {
    ...LANDING.en,
    path: "/en/app",
    title: "Dorsal · Attack Shark X85 Pro configurator",
    description: "Configure the Attack Shark X85 Pro in the browser: TFT screen, keys, RGB lighting and system, via WebHID.",
    robots: "noindex, follow",
  },
};

export const metaFor = (page: SeoPage, lang: SeoLang) => (page === "app" ? APP : LANDING)[lang];

const FEATURES: Record<SeoLang, string[]> = {
  pt: [
    "Imagens e GIFs na tela TFT de 128×128, com enquadramento e prévia em 3D",
    "Sincronização do relógio da tela TFT",
    "Remapeamento de teclas nas camadas normal e Fn, com mídia, atalhos e a tecla \\ | do ABNT2",
    "Iluminação RGB: efeito, cor, brilho e velocidade, com prévia antes de aplicar",
    "Taxa de polling, debounce e tempos de suspensão",
    "Backup e restauração das configurações",
    "Instalador da regra udev para o Linux, numa linha",
    "AppImage para Linux, ou direto no navegador via WebHID",
  ],
  en: [
    "Images and GIFs on the 128×128 TFT screen, with framing and a 3D preview",
    "TFT screen clock sync",
    "Key remapping on the normal and Fn layers, with media keys and shortcuts",
    "RGB lighting: effect, colour, brightness and speed, previewed before applying",
    "Polling rate, debounce and sleep timers",
    "Backup and restore of the settings",
    "One-line udev rule installer for Linux",
    "Linux AppImage, or right in the browser via WebHID",
  ],
};

export const featuresFor = (lang: SeoLang) => FEATURES[lang];

/** schema.org description of the app, for the page's JSON-LD block. */
export function jsonLd(site: string, lang: SeoLang, version: string, repo: string) {
  const m = LANDING[lang];
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Dorsal",
    url: site + m.path,
    description: m.description,
    inLanguage: lang === "en" ? "en" : "pt-BR",
    image: site + m.image,
    screenshot: `${site}/landing/${lang}/screen.png`,
    applicationCategory: "UtilitiesApplication",
    applicationSubCategory: lang === "en" ? "Keyboard configurator" : "Configurador de teclado",
    operatingSystem: "Linux, Windows, macOS, ChromeOS",
    softwareRequirements:
      lang === "en"
        ? "A browser with WebHID (Chrome, Edge, Chromium, Brave) or the Linux AppImage; the Attack Shark X85 Pro over its USB cable"
        : "Um navegador com WebHID (Chrome, Edge, Chromium, Brave) ou o AppImage para Linux; o Attack Shark X85 Pro pelo cabo USB",
    softwareVersion: version,
    downloadUrl: `${repo}/releases/latest`,
    license: "https://www.gnu.org/licenses/gpl-3.0.html",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    author: { "@type": "Person", name: AUTHOR.name, alternateName: AUTHOR.alternateName, url: AUTHOR.url, sameAs: [AUTHOR.github] },
    sameAs: [repo],
    keywords: "Attack Shark X85 Pro, Linux, WebHID, configurator, TFT screen, GIF, RGB, keymapper, RongYuan YC3123, udev rules, AppImage",
    featureList: FEATURES[lang],
  };
}
