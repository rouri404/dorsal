import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { seoBody, seoHead, type SeoSite } from "./src/seo/html";
import type { SeoLang, SeoPage } from "./src/seo/meta";

/**
 * One HTML file per kind of route, each with its own head and readable content for crawlers:
 * index.html (/), en.html (/en), app.html (/app/*) and app-en.html (/en/app/*). Also robots.txt,
 * sitemap.xml and llms.txt for the site's address (VITE_SITE_URL).
 */
function seoFiles(info: SeoSite): Plugin {
  const { site, repo } = info;
  const variants: [string, SeoPage, SeoLang][] = [
    ["index.html", "landing", "pt"],
    ["en.html", "landing", "en"],
    ["app.html", "app", "pt"],
    ["app-en.html", "app", "en"],
  ];
  const fill = (html: string, page: SeoPage, lang: SeoLang) =>
    html
      .replace('lang="pt-BR"', `lang="${lang === "en" ? "en" : "pt-BR"}"`)
      .replace("<!--seo:head-->", seoHead(page, lang, info))
      .replace("<!--seo:body-->", seoBody(page, lang, info));
  const routeOf = (url: string): [SeoPage, SeoLang] => {
    const path = url.split("?")[0];
    const lang = /^\/en(\/|$)/.test(path) ? "en" : "pt";
    return [/^(\/en)?\/app(\/|$)/.test(path) ? "app" : "landing", lang];
  };
  const alternates = (pt: string, en: string) =>
    [["pt-BR", pt], ["en", en], ["x-default", en]].map(([l, p]) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${site}${p}" />`).join("\n");
  const sitemap = ["/", "/en"].map((loc) => `  <url>\n    <loc>${site}${loc}</loc>\n${alternates("/", "/en")}\n  </url>`).join("\n");
  const llms = readFileSync(fileURLToPath(new URL("./src/seo/llms.txt", import.meta.url)), "utf8").replaceAll("@SITE@", site).replaceAll("@REPO@", repo);
  return {
    name: "seo-files",
    enforce: "post",
    // In dev every route gets the page it will have on the site; the build fills them below.
    transformIndexHtml: (html, ctx) => (ctx.server && html.includes("<!--seo:head-->") ? fill(html, ...routeOf(ctx.originalUrl ?? ctx.path)) : html),
    configureServer: (server) =>
      void server.middlewares.use((req, res, next) => {
        if ((req.url ?? "").split("?")[0] !== "/llms.txt") return next();
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end(llms);
      }),
    generateBundle(_options, bundle) {
      const template = bundle["index.html"];
      if (template?.type !== "asset") return;
      const html = String(template.source);
      for (const [fileName, page, lang] of variants) {
        if (fileName === "index.html") template.source = fill(html, page, lang);
        else this.emitFile({ type: "asset", fileName, source: fill(html, page, lang) });
      }
      this.emitFile({ type: "asset", fileName: "robots.txt", source: `User-agent: *\nAllow: /\n\nSitemap: ${site}/sitemap.xml\n` });
      this.emitFile({
        type: "asset",
        fileName: "sitemap.xml",
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${sitemap}\n</urlset>\n`,
      });
      this.emitFile({ type: "asset", fileName: "llms.txt", source: llms });
    },
  };
}

/**
 * The one-line Linux setups, filled in with the site and the shared header (setup/header.sh):
 * udev.sh, the landing page's access rule (udev/install.sh), and music.sh, which lets the site
 * hear the computer's sound (setup/music.sh).
 */
function setupScripts(site: string): Plugin {
  const read = (file: string) => readFileSync(fileURLToPath(new URL(`./${file}`, import.meta.url)), "utf8");
  const fill = (file: string, parts: Record<string, string>) => {
    let out = read(file).replace("@HEADER@", () => read("setup/header.sh").trimEnd());
    for (const [key, file] of Object.entries(parts)) out = out.replace(key, () => read(file).trim());
    return out.replaceAll("@SITE@", site);
  };
  const scripts: Record<string, () => string> = {
    "udev.sh": () => fill("udev/install.sh", { "@RULE@": "udev/70-attack-shark-x85.rules" }),
    "music.sh": () => fill("setup/music.sh", { "@CONF@": "setup/dorsal-music.conf" }),
  };
  return {
    name: "setup-scripts",
    configureServer: (server) =>
      void server.middlewares.use((req, res, next) => {
        const script = scripts[(req.url ?? "").split("?")[0].slice(1)];
        if (!script) return next();
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.end(script());
      }),
    generateBundle() {
      for (const [fileName, script] of Object.entries(scripts)) this.emitFile({ type: "asset", fileName, source: script() });
    },
  };
}

/** In dev and preview, the download links serve the AppImages from release/ and release-mini/. */
function serveAppImages(): Plugin {
  const handler = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const name = /^\/(Dorsal(?:-Screen)?-[\w.]+\.AppImage)$/.exec((req.url ?? "").split("?")[0])?.[1];
    if (!name) return next();
    const file = ["release", "release-mini"].map((dir) => fileURLToPath(new URL(`./${dir}/${name}`, import.meta.url))).find(existsSync);
    if (!file) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end(`${name} is not built yet: run npm run appimage or npm run appimage:mini.\n`);
      return;
    }
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
    res.setHeader("Content-Length", String(statSync(file).size));
    createReadStream(file).pipe(res);
  };
  return {
    name: "serve-appimages",
    configureServer: (server) => void server.middlewares.use(handler),
    configurePreviewServer: (server) => void server.middlewares.use(handler),
  };
}

// Absolute paths: routes like /en/app/keys load their assets from the root, on the web and
// in the AppImages (which serve dist from app://x85/).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const site = (env.VITE_SITE_URL || "https://dorsal.cotoo.dev").replace(/\/$/, "");
  const repo = (env.VITE_REPO_URL || "https://github.com/rouri404/dorsal").replace(/\/$/, "");
  const { version } = JSON.parse(readFileSync(fileURLToPath(new URL("./package.json", import.meta.url)), "utf8")) as { version: string };
  return {
    base: "/",
    plugins: [react(), tailwindcss(), seoFiles({ site, repo, version }), setupScripts(site), serveAppImages()],
    build: {
      rollupOptions: {
        input: {
          main: fileURLToPath(new URL("./index.html", import.meta.url)),
          mini: fileURLToPath(new URL("./mini.html", import.meta.url)),
          background: fileURLToPath(new URL("./background.html", import.meta.url)),
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
