# Deployment

The site lives at **[dorsal.cotoo.dev](https://dorsal.cotoo.dev)**. It is a static build, so any static host works; these steps use Vercel, which the repository is configured for.

## The site

1. **Import the repository** in Vercel. The framework is detected as Vite; the build command is `npm run build` and the output directory is `dist`.
2. **Set the environment variables** in the project settings (`.env` is not committed):

   | Variable | Value |
   | --- | --- |
   | `VITE_SITE_URL` | `https://dorsal.cotoo.dev` |
   | `VITE_DOWNLOAD_BASE` | Where the AppImages are hosted (see below), or empty |
   | `VITE_REPO_URL` | `https://github.com/rouri404/dorsal` (optional: this is the default) |

3. **Add the domain** `dorsal.cotoo.dev` to the project, and at the DNS provider of `cotoo.dev` create the record Vercel asks for, usually a `CNAME` from `dorsal` to `cname.vercel-dns.com`.
4. **Deploy.** HTTPS comes with the domain, and WebHID needs it.

### Routing

The build writes one HTML file per kind of route, each with its own title, description, canonical link, `hreflang` links, link-preview tags and readable content for crawlers that do not run JavaScript (React replaces it when it mounts). `vercel.json` sends each route to its file:

| Route | File | Indexed |
|---|---|---|
| `/` | `index.html` (Portuguese landing page, with JSON-LD) | yes |
| `/en` | `en.html` (English landing page, with JSON-LD) | yes |
| `/app/*` | `app.html` | no (`noindex, follow`) |
| `/en/app/*` | `app-en.html` | no (`noindex, follow`) |

Files keep their own paths: `/assets/*`, `/landing/*`, `/mini.html`, the icons, `og.png` and `og-pt.png`, `robots.txt`, `sitemap.xml`, `llms.txt`, `udev.sh` (the one-line Linux setup the landing page shows) and the AppImages. The texts and tags live in `src/seo/`; `robots.txt`, `sitemap.xml` and `llms.txt` follow `VITE_SITE_URL`.

## The AppImages

```bash
npm run appimage        # release/Dorsal-<version>.AppImage
npm run appimage:mini   # release-mini/Dorsal-Screen-<version>.AppImage
```

Each is about 100 MB: the Vite build and Electron with its English and Portuguese locales only (the dependencies are already bundled into `dist/`, so `node_modules` stays out). The landing page links to `<VITE_DOWNLOAD_BASE>/Dorsal-<version>.AppImage` and `<VITE_DOWNLOAD_BASE>/Dorsal-Screen-<version>.AppImage`:

- **On a release page (recommended)**: attach both files to a GitHub release and set `VITE_DOWNLOAD_BASE` to its download URL, such as `https://github.com/<user>/dorsal/releases/download/v0.1.0`. Large binaries stay out of the site and of the repository.
- **On the site itself**: leave `VITE_DOWNLOAD_BASE` empty and publish the files at the site's root. Check your host's limit on file size first.

Locally, `npm run dev` and `npm run preview` serve the AppImages from `release/` and `release-mini/` at those same paths, so the download buttons work before anything is published.

When the version changes, update `version` in `package.json` and `VERSION` in `src/landing/LandingApp.tsx`.

## After each deploy

- [ ] `/` and `/en` open the landing page in each language.
- [ ] `/app/tela` and `/en/app/keys` open the configurator; `?demo` works without a keyboard.
- [ ] `/mini.html` opens Dorsal Screen.
- [ ] The download buttons reach both AppImages.
- [ ] `/robots.txt` and `/sitemap.xml` name `dorsal.cotoo.dev`.
- [ ] A shared link shows the preview image: `/og-pt.png` for `/`, `/og.png` for `/en`.
- [ ] `curl -s https://<site>/en` shows the English title and content without JavaScript; `/llms.txt` is plain text.
