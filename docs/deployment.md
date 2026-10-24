# Deployment

The site lives at **[dorsal.cotoo.dev](https://dorsal.cotoo.dev)**. It is a static build, so any static host works; these steps use Vercel, which the repository is configured for.

## The site

1. **Import the repository** in Vercel. The framework is detected as Vite; the build command is `npm run build` and the output directory is `dist`.
2. **Set the environment variables** in the project settings (`.env` is not committed):

   | Variable | Value |
   | --- | --- |
   | `VITE_SITE_URL` | `https://dorsal.cotoo.dev` |
   | `VITE_DOWNLOAD_BASE` | Where the AppImages are hosted (see below), or empty |

3. **Add the domain** `dorsal.cotoo.dev` to the project, and at the DNS provider of `cotoo.dev` create the record Vercel asks for, usually a `CNAME` from `dorsal` to `cname.vercel-dns.com`.
4. **Deploy.** HTTPS comes with the domain, and WebHID needs it.

### Routing

`vercel.json` sends every path that is not a file to `index.html`, so `/en/app/keys` opens the configurator directly. Files keep their own paths: `/assets/*`, `/landing/*`, `/mini.html`, the icons, `og.png`, `robots.txt`, `sitemap.xml` and the AppImages.

## The AppImages

```bash
npm run appimage        # release/Dorsal-<version>.AppImage
npm run appimage:mini   # release-mini/Dorsal-Screen-<version>.AppImage
```

Each is about 135 MB. The landing page links to `<VITE_DOWNLOAD_BASE>/Dorsal-<version>.AppImage` and `<VITE_DOWNLOAD_BASE>/Dorsal-Screen-<version>.AppImage`:

- **On a release page (recommended)**: attach both files to a GitHub release and set `VITE_DOWNLOAD_BASE` to its download URL, such as `https://github.com/<user>/dorsal/releases/download/v0.1.0`. Large binaries stay out of the site and of the repository.
- **On the site itself**: leave `VITE_DOWNLOAD_BASE` empty and publish the files at the site's root. Check your host's limit on file size first.

When the version changes, update `version` in `package.json` and `VERSION` in `src/landing/LandingApp.tsx`.

## After each deploy

- [ ] `/` and `/en` open the landing page in each language.
- [ ] `/app/tela` and `/en/app/keys` open the configurator; `?demo` works without a keyboard.
- [ ] `/mini.html` opens Dorsal Screen.
- [ ] The download buttons reach both AppImages.
- [ ] `/robots.txt` and `/sitemap.xml` name `dorsal.cotoo.dev`.
- [ ] A shared link shows the preview image (`/og.png`).
