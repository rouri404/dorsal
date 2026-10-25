# Contributing

**English** · [Português](CONTRIBUTING.pt.md)

Thanks for helping. Bug reports, protocol findings and pull requests are all welcome.

## Reporting a problem

Open an [issue](https://github.com/rouri404/dorsal/issues) with:

- where it happened: the website (and which browser), the Dorsal AppImage or Dorsal Screen;
- your system and how the keyboard is connected (it has to be the USB cable);
- what you did, what you expected and what happened instead;
- for connection problems, the output of `ls -l /dev/hidraw*` with the keyboard plugged in.

[`docs/troubleshooting.md`](docs/troubleshooting.md) covers the usual cases.

## Setting up

```bash
npm install
npm run dev        # http://localhost:5173, in Chrome, Edge, Chromium or Brave
```

No keyboard? Open `http://localhost:5173/app?demo`: demo mode replays answers captured from a real X85 Pro, and writes stay in memory. Scripts, environment variables and modes are in [`docs/development.md`](docs/development.md).

## Before opening a pull request

```bash
npm run typecheck
npm test
```

- **Text:** every visible string goes through `tr("pt", "en")`, with both languages. Names from the protocol tables get their English name in `src/i18n/labels.ts`.
- **Components:** new UI comes from [beUI](https://beui.dev) (`npx shadcn@latest add @beui/<name>`). Dependencies are pinned to exact versions.
- **Comments:** only where the code cannot say it, such as a firmware quirk or why a workaround exists.
- **UI changes:** add a screenshot to the pull request, in demo mode is fine.

## Commits

[Conventional Commits](https://www.conventionalcommits.org), without a scope, one change per commit:

```
feat: switch language in Dorsal Screen
fix: read back lighting and sleep writes in demo mode
docs: translate the protocol notes to English
```

## The protocol

The keyboard is reverse engineered for interoperability; [`docs/protocol.md`](docs/protocol.md) has what is known.

- **Never copy proprietary code.** Describe the behaviour you observed and implement it yourself.
- **Writes are risky.** Try them in demo mode, then with dry run on (developer mode, `?dev`), and only then on the keyboard, with a backup made first. Say in the pull request which ones you tested on real hardware.
- **Out of scope:** firmware updates, because a failed one can brick the keyboard.

New findings (a command, an unknown Fn function, the dongle's channel) are very welcome, even without code: open an issue with the bytes you sent and received.
