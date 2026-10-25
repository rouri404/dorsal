// Keeps the head in step with client-side navigation (language switch, landing ↔ app), the same
// tags the build writes into each route's HTML.

import { version } from "../../package.json";
import { jsonLd, metaFor, type SeoLang, type SeoPage } from "./meta";

function set(selector: string, attr: string, value: string) {
  document.head.querySelector(selector)?.setAttribute(attr, value);
}

export function applyHead(page: SeoPage, lang: SeoLang, site: string, repo: string, canonicalPath: string) {
  const m = metaFor(page, lang);
  const other = metaFor(page, lang === "en" ? "pt" : "en");
  document.documentElement.lang = lang === "en" ? "en" : "pt-BR";
  set('meta[name="description"]', "content", m.description);
  set('meta[name="robots"]', "content", m.robots);
  set('link[rel="canonical"]', "href", site + canonicalPath);
  set('link[hreflang="pt-BR"]', "href", site + metaFor(page, "pt").path);
  set('link[hreflang="en"]', "href", site + metaFor(page, "en").path);
  set('link[hreflang="x-default"]', "href", site + metaFor(page, "en").path);
  set('meta[property="og:url"]', "content", site + canonicalPath);
  set('meta[property="og:title"]', "content", m.ogTitle);
  set('meta[property="og:description"]', "content", m.ogDescription);
  set('meta[property="og:image"]', "content", site + m.image);
  set('meta[property="og:image:alt"]', "content", m.imageAlt);
  set('meta[property="og:locale"]', "content", m.locale);
  set('meta[property="og:locale:alternate"]', "content", other.locale);
  set('meta[name="twitter:title"]', "content", m.ogTitle);
  set('meta[name="twitter:description"]', "content", m.ogDescription);
  set('meta[name="twitter:image"]', "content", site + m.image);
  set('meta[name="twitter:image:alt"]', "content", m.imageAlt);
  const ld = document.head.querySelector('script[type="application/ld+json"]');
  if (ld) ld.textContent = page === "landing" ? JSON.stringify(jsonLd(site, lang, version, repo)) : "";
}
