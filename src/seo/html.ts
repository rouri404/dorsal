// The static HTML of each route, written into the build so crawlers and link previews read the
// page without running JavaScript. React replaces the #root content when it mounts.

import { AUTHOR, featuresFor, jsonLd, metaFor, type SeoLang, type SeoPage } from "./meta";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface SeoSite {
  site: string;
  repo: string;
  version: string;
}

export function seoHead(page: SeoPage, lang: SeoLang, { site, repo, version }: SeoSite): string {
  const m = metaFor(page, lang);
  const other = metaFor(page, lang === "en" ? "pt" : "en");
  const tags = [
    `<title>${esc(m.title)}</title>`,
    `<meta name="description" content="${esc(m.description)}" />`,
    `<meta name="robots" content="${m.robots}" />`,
    `<meta name="author" content="${AUTHOR.name} (${AUTHOR.alternateName})" />`,
    `<meta name="theme-color" content="#0a0b0c" />`,
    `<link rel="canonical" href="${site}${m.path}" />`,
    `<link rel="alternate" hreflang="pt-BR" href="${site}${metaFor(page, "pt").path}" />`,
    `<link rel="alternate" hreflang="en" href="${site}${metaFor(page, "en").path}" />`,
    `<link rel="alternate" hreflang="x-default" href="${site}${metaFor(page, "en").path}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Dorsal" />`,
    `<meta property="og:url" content="${site}${m.path}" />`,
    `<meta property="og:title" content="${esc(m.ogTitle)}" />`,
    `<meta property="og:description" content="${esc(m.ogDescription)}" />`,
    `<meta property="og:image" content="${site}${m.image}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${esc(m.imageAlt)}" />`,
    `<meta property="og:locale" content="${m.locale}" />`,
    `<meta property="og:locale:alternate" content="${other.locale}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(m.ogTitle)}" />`,
    `<meta name="twitter:description" content="${esc(m.ogDescription)}" />`,
    `<meta name="twitter:image" content="${site}${m.image}" />`,
    `<meta name="twitter:image:alt" content="${esc(m.imageAlt)}" />`,
  ];
  if (page === "landing") {
    const ld = JSON.stringify(jsonLd(site, lang, version, repo)).replace(/</g, "\\u003c");
    tags.push(`<script type="application/ld+json">${ld}</script>`, `<style>${FALLBACK_CSS}</style>`);
  }
  return tags.join("\n    ");
}

// Close to the landing page's hero, so the swap to the real page is barely noticeable.
const FALLBACK_CSS =
  "html{background:#0a0b0c;color-scheme:dark}" +
  ".seo{max-width:760px;margin:0 auto;padding:40px 20px 64px;font:16px/1.6 'IBM Plex Sans',system-ui,sans-serif;color:#a3a3a3}" +
  ".seo h1{margin:40px 0 16px;font-size:clamp(36px,6vw,56px);line-height:1.05;letter-spacing:-.03em;color:#fafafa}" +
  ".seo h2{margin:40px 0 8px;font-size:20px;color:#fafafa}.seo a{color:#fafafa}.seo nav{display:flex;gap:20px;font-weight:600}" +
  ".seo pre{overflow-x:auto;padding:12px 16px;border-radius:12px;background:#111214}.seo code{font-family:'IBM Plex Mono',ui-monospace,monospace;font-size:14px}";

const TEXT = {
  pt: {
    other: ["English", "/en", "en"],
    h1: "O seu X85 Pro, configurado no Linux.",
    lead: "O Dorsal é um configurador aberto e gratuito para o teclado mecânico Attack Shark X85 Pro: imagens e GIFs na tela TFT, teclas, iluminação RGB e bateria, sem Windows e sem driver. Funciona direto no navegador, via WebHID, ou num AppImage para Linux.",
    use: "Usar no navegador",
    download: "Baixar o AppImage",
    features: "Recursos",
    how: "Como funciona",
    howText:
      "O teclado fala por relatórios HID de 64 bytes, os mesmos que o software oficial envia (família de comandos RongYuan YC3123). O Dorsal reimplementa esse protocolo e conversa com o teclado pelo WebHID do navegador. No Linux, uma regra udev dá ao seu usuário acesso ao teclado, sem root e sem driver:",
    cable: "Conecte o teclado pelo cabo USB: pelo dongle 2.4G ele ainda não aceita configurações.",
    open: "Código aberto",
    openText: "Software livre sob a GPL-3.0. Código, documentação do protocolo e releases no",
  },
  en: {
    other: ["Português", "/", "pt-BR"],
    h1: "Your X85 Pro, configured on Linux.",
    lead: "Dorsal is a free, open configurator for the Attack Shark X85 Pro mechanical keyboard: images and GIFs on the TFT screen, keys, RGB lighting and battery, with no Windows and no driver. It runs right in the browser, via WebHID, or as a Linux AppImage.",
    use: "Use it in the browser",
    download: "Download the AppImage",
    features: "Features",
    how: "How it works",
    howText:
      "The keyboard talks through 64-byte HID reports, the same ones the vendor software sends (the RongYuan YC3123 command family). Dorsal reimplements that protocol and talks to the keyboard through the browser's WebHID. On Linux, one udev rule gives your user access to the keyboard, with no root and no driver:",
    cable: "Connect the keyboard with its USB cable: over the 2.4G dongle it takes no settings yet.",
    open: "Open source",
    openText: "Free software under the GPL-3.0. Code, protocol notes and releases on",
  },
};

export function seoBody(page: SeoPage, lang: SeoLang, { site, repo }: SeoSite): string {
  if (page === "app") {
    return lang === "en"
      ? `<noscript>Dorsal configures the Attack Shark X85 Pro and needs JavaScript and a browser with WebHID. <a href="${site}/en">About Dorsal</a></noscript>`
      : `<noscript>O Dorsal configura o Attack Shark X85 Pro e precisa de JavaScript e de um navegador com WebHID. <a href="${site}/">Sobre o Dorsal</a></noscript>`;
  }
  const t = TEXT[lang];
  const app = metaFor("app", lang).path;
  const [otherName, otherPath, otherLang] = t.other;
  return `<main class="seo">
        <nav><a href="${metaFor("landing", lang).path}">Dorsal</a><a href="${otherPath}" hreflang="${otherLang}" lang="${otherLang}">${otherName}</a></nav>
        <h1>${esc(t.h1)}</h1>
        <p>${esc(t.lead)}</p>
        <p><a href="${app}">${t.use}</a> · <a href="${repo}/releases/latest">${t.download}</a></p>
        <h2>${t.features}</h2>
        <ul>${featuresFor(lang)
          .map((f) => `<li>${esc(f)}</li>`)
          .join("")}</ul>
        <h2>${t.how}</h2>
        <p>${esc(t.howText)}</p>
        <pre><code>curl -fsSL ${site}/udev.sh | sudo sh</code></pre>
        <p>${esc(t.cable)}</p>
        <h2>${t.open}</h2>
        <p>${t.openText} <a href="${repo}">GitHub</a>.</p>
      </main>`;
}
