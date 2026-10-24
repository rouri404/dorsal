# Development

## Requirements

- **Node.js 22** or newer.
- A **Chromium-based browser** with WebHID: Chrome, Edge, Chromium or Brave.
- On Linux, the **udev rule** that lets your user open the keyboard (once):

```bash
curl -fsSL https://dorsal.cotoo.dev/udev.sh | sudo sh
```

The script, generated at build time for `VITE_SITE_URL` (`udevScript` in `vite.config.ts`), writes `udev/70-attack-shark-x85.rules` to `/etc/udev/rules.d/` and reloads udev. From a clone, the same by hand:

```bash
sudo cp udev/70-attack-shark-x85.rules /etc/udev/rules.d/
sudo udevadm control --reload && sudo udevadm trigger --subsystem-match=hidraw
```

Then unplug and replug the keyboard.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Development server at `http://localhost:5173` |
| `npm run build` | Type check and build into `dist/` (also writes `robots.txt` and `sitemap.xml`) |
| `npm run preview` | Serve the build locally |
| `npm test` | Vitest: protocol, layout, factory key map and screen conversion |
| `npm run typecheck` | Type check only |
| `npm run electron` | Build and open the configurator in an Electron window |
| `npm run appimage` | `release/Dorsal-<version>.AppImage` |
| `npm run appimage:mini` | `release-mini/Dorsal-Screen-<version>.AppImage` |

## Environment

`.env` (copy `.env.example`) is read at build time:

| Variable | Default | Description |
| --- | --- | --- |
| `VITE_SITE_URL` | `https://dorsal.cotoo.dev` | The site's address: canonical links, social preview, `robots.txt`, `sitemap.xml` |
| `VITE_X85_DEV` | `0` | `1` turns on developer mode: the dry-run switch and the Log section |
| `VITE_DOWNLOAD_BASE` | empty | Where the landing page downloads the AppImages from; empty means the site's root |
| `VITE_REPO_URL` | `https://github.com/rouri404/dorsal` | The repository: the landing page's link to open an issue |

The AppImages also read variables when they start:

| Variable | Description |
| --- | --- |
| `X85_DEMO=1` | Demo mode, no keyboard needed |
| `X85_DEV=1` | Developer mode |
| `X85_LANG=pt\|en` | Language (default: the system's) |
| `X85_TAB=<section>` | Open on a section, such as `teclas` or `keys` |
| `X85_NO_HID=1` | Hide the keyboard, to see the "not connected" state |
| `X85_SCREENSHOT=<file.png>` | Render without a window, save a capture and quit |
| `X85_SCREENSHOT_DELAY=<ms>` | Wait before the capture (default 2500) |
| `X85_SAMPLE=<image>` | Preload an image in the screen editor |
| `X85_PREVIEW_UPLOAD=<0..1>` | Show an upload in progress, without sending anything |

## Modes

- **Demo mode** (`?demo`, `X85_DEMO=1`): replays the answers of a real X85 Pro captured in `src/demo/x85-capture.json`. Writes only change memory. Good for working on the UI without the keyboard.
- **Developer mode** (`?dev`, `VITE_X85_DEV=1`, `X85_DEV=1`): adds the **Dry run** switch, which logs writes instead of sending them, and the **Log** section with every packet exchanged.

## Tests

The tests run against answers captured from the keyboard (`tests/fixtures/`):

- **Protocol**: packet encoding and both checksums.
- **Layout**: the 81 keys on real matrix slots, without overlaps, with the TFT above the right arrow.
- **Factory map**: the right column (Home, PgUp, PgDn) and the three remaps on the captured keyboard.
- **Screen**: framing defaults, RGB565 conversion, the bounding box and the upload chunks.

## Conventions

- **Text**: every visible string goes through `tr("pt", "en")`. Names from the protocol tables go through `labelIn` / `keyName` in `src/i18n/labels.ts`; add the English name there when you add a function or effect.
- **Components**: UI components come from [beUI](https://beui.dev) through the shadcn CLI (`npx shadcn@latest add @beui/<name>`). Answer *no* when it offers to overwrite files that already exist, and pin new dependencies to exact versions in `package.json`.
- **Name and logo**: `src/brand/` (the name is a working one).
- **Writes to the keyboard**: test them first in demo mode, then with dry run on (developer mode), and only then for real.
