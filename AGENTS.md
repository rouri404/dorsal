# AGENTS.md

Notes for coding agents working on Dorsal, an open configurator for the Attack Shark X85 Pro. It
runs as a WebHID site (https://dorsal.cotoo.dev) and as two Electron AppImages: Dorsal and Dorsal
Screen. Setup, scripts, environment variables and modes are in
[`docs/development.md`](docs/development.md); how the code fits together is in
[`docs/architecture.md`](docs/architecture.md).

## Commands

```bash
npm test              # Vitest
npm run typecheck     # tsc
npm run build         # typecheck + Vite build into dist/
npm run appimage      # release/Dorsal-<version>.AppImage
npm run appimage:mini # release-mini/Dorsal-Screen-<version>.AppImage
```

Run `npm test` and `npm run typecheck` before calling a change done. To see the UI without a
keyboard, open the app with `?demo` (or `X85_DEMO=1` for the AppImages).

## Where things are

| Path | What |
| --- | --- |
| `src/hid/` | WebHID transport: 64-byte feature reports, a serial queue, `batch` for exclusive runs |
| `src/protocol/` | The keyboard's commands (`x85.ts`), the effect table (`effects.ts`), key codes |
| `src/studio/` | The effect studio: layers, the seamless loop, upload, saved effects |
| `src/app/` | The configurator UI, the 3D board (`Board3D.tsx`) and the light preview (`lightFx.ts`) |
| `src/screen/` | TFT image and GIF upload |
| `src/music/` | The music modes: spectrum to bar heights (`bands.ts`) and the streaming engine |
| `src/demo/` | Demo mode: replays a real keyboard's captured answers |
| `src/components/motion/`, `src/lib/` | Vendored [beUI](https://beui.dev): do not edit |
| `docs/protocol.md` | The HID protocol, command by command, with what was verified on hardware |

## Conventions

- **Commits:** Conventional Commits without a scope (`feat: …`, `fix: …`, never `feat(app): …`).
  Write only a lowercase title line, with no body and no `Co-Authored-By` or other trailers. Commit
  only when the maintainer asks.
- **Text:** every visible string goes through `tr("Português", "English")`. Portuguese (pt-BR)
  comes first.
- **Style:** match the surrounding code: its naming, comment density and idioms. Do not run
  Prettier over existing files.
- **Dependencies:** pin exact versions. Vite bundles everything into `dist/`, so the AppImages ship
  no `node_modules`.
- **Tests:** keep the logic in pure modules (the protocol, `src/studio/`, `src/music/bands.ts`,
  `lightFx.ts`, `paint.ts`) and test it there. Check UI changes in demo mode.
- **Docs:** when you learn something about the protocol, record it in `docs/protocol.md`, saying
  whether it was seen on the keyboard.

## The keyboard

- **Talking to it:** VID `0x3151`, PID `0x5002` on the cable and `0x5006` on the 2.4G dongle. On
  Linux it needs the udev rule in `udev/`.
- **Writes are real:** test new writes in demo mode first, then with dry run (developer mode), and
  only then on the keyboard. Back up what you will change, read every write back, and undo it at
  the end.
- **Never** send firmware or OTA updates, and never send a factory reset (`0x01`) without the
  maintainer's explicit go-ahead.
- **Stored animations** (mode 25, command `0x12`) are capped at 100 frames: past about 100, the
  keyboard plays leftovers of earlier uploads.
- **No side light:** the X85 Pro has no side light strip, even though the firmware answers its
  commands.
