import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/** robots.txt and sitemap.xml for the site's address (VITE_SITE_URL), written into the build. */
function seoFiles(site: string): Plugin {
  const pages: [string, string][] = [
    ["/", "/en"],
    ["/app/tela", "/en/app/screen"],
    ["/app/teclas", "/en/app/keys"],
    ["/app/iluminacao", "/en/app/lighting"],
    ["/app/sistema", "/en/app/system"],
  ];
  const url = (pt: string, en: string, loc: string) =>
    `  <url>\n    <loc>${site}${loc}</loc>\n    <xhtml:link rel="alternate" hreflang="pt-BR" href="${site}${pt}" />\n    <xhtml:link rel="alternate" hreflang="en" href="${site}${en}" />\n  </url>`;
  return {
      name: "seo-files",
      generateBundle() {
        this.emitFile({ type: "asset", fileName: "robots.txt", source: `User-agent: *\nAllow: /\n\nSitemap: ${site}/sitemap.xml\n` });
        this.emitFile({
          type: "asset",
          fileName: "sitemap.xml",
          source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${pages.flatMap(([pt, en]) => [url(pt, en, pt), url(pt, en, en)]).join("\n")}\n</urlset>\n`,
        });
      },
  };
}

// Absolute paths: routes like /en/app/keys load their assets from the root, on the web and
// in the AppImages (which serve dist from app://x85/).
export default defineConfig(({ mode }) => {
  const site = (loadEnv(mode, process.cwd(), "VITE_").VITE_SITE_URL || "https://dorsal.cotoo.dev").replace(/\/$/, "");
  return {
    base: "/",
    plugins: [react(), tailwindcss(), seoFiles(site)],
    // Two pages: the site (landing and configurator, routed in the app) and the mini screen app.
    build: {
      rollupOptions: {
        input: {
          main: fileURLToPath(new URL("./index.html", import.meta.url)),
          mini: fileURLToPath(new URL("./mini.html", import.meta.url)),
        },
      },
    },
    resolve: {
      alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    },
    test: {
      environment: "node",
      include: ["tests/**/*.test.ts"],
    },
  };
});
