# Roadmap

Dorsal is growing from a configurator into a full driver for the X85 Pro: a lighting editor as
faithful as the vendor's, light that follows the music, an app that lives in the tray, and
profiles. The work is split into parts, done one at a time and in this order. Each
part gets its own design, plan and release, and is usable on its own.

| # | Part | Status |
|---|---|---|
| 1 | [Faithful lighting](#1-faithful-lighting) | done |
| 2 | [Effect studio](#2-effect-studio) | done |
| 3 | [Music engine](#3-music-engine) | protocol confirmed on hardware |
| 4 | [Dorsal in the background](#4-dorsal-in-the-background) | planned |
| 5 | [Profiles](#5-profiles) | planned |

The protocol facts behind this plan are in [`protocol.md`](protocol.md#lighting-beyond-the-effect-list).

## 1. Faithful lighting

The lighting tab is the least complete part of the app. It covers 20 effects, one colour,
brightness and speed, while the firmware does more.

- **Per-key colours** (mode 13): paint each key, read with `0x8C` and written with `0x0C`.
- **Effect options**: the high nibble of byte 4 of `0x07` (direction or variant, per effect).
- **The missing modes** in the list: 13 (per-key) here; 20 and 22 (music) and 21 (screen
  colour) are wired up in part 3; 25 plays the animations of part 2.
- **A truer 3D preview**: each effect's motion is timed against a video of the keyboard running
  every effect and option.
- **No side light**: the firmware answers `0x88`, but the X85 has no side strip (checked on the
  user's keyboard). The side-light card and its ring of LEDs on the 3D model go away.

## 2. Effect studio

Effects built in Dorsal, in the spirit of Razer's Chroma Studio, and stored on the keyboard: it
plays them on its own, with no computer, and keeps them when unplugged (mode 25, uploaded with
`0x12`; up to 100 frames, about 9 s to upload, confirmed on hardware).

- **Layers**: linear waves at any angle, radial waves from a point, solid colours, keys painted
  one by one (with the per-key tools; unpainted keys let the layers below show), and the
  keyboard's own animated effects (breathing, meteor, train, fireworks…), drawn as the preview
  draws them, with the typing ones on simulated presses. Waves and solid colours cover the layers
  below where their areas meet; an effect layer shows them where it is dark.
- **Per layer**: a gradient of 1 to 8 evenly spaced colours, width, softness and speed, and a
  brightness that dims the layer without making it see-through; an area
  of keys painted on the board, a quick set (letters, numbers, F-row, arrows), or all keys.
- **One loop**: the frames repeat seamlessly; speeds are nudged so every layer closes its cycle,
  and an effect that never repeats gets a loop of at least 8 s whose end fades into its start.
- **Saved effects**: kept by Dorsal, since the keyboard holds one animation and cannot be read
  back; the backup includes them.

## 3. Music engine

The keys light up to the music playing on the computer, in the firmware's two music modes,
Classic (20) and EDM (22). Works in the site and in the AppImage.

- **Sending** (confirmed on hardware): the host streams `0x0D` packets with 42 band heights, each
  0 to 6, about every 20 ms. The keyboard draws them; it has no microphone of its own.
- **Analysis**: Web Audio splits the sound into 42 log-spaced bands, with a fast rise and a slow
  fall.
- **Capture**:
  - **AppImage:** on Linux, Chromium does not list PipeWire's monitor sources. The AppImage loads
    a remap source from the output's monitor while the music runs, and removes it afterwards
    (`pactl load-module module-remap-source`). Tested: it captures any program.
  - **Site:** the browser cannot create that source. It offers sharing a tab with its audio, or a
    one-time command that sets up a permanent source, in the spirit of `udev.sh`.
- **Limit**: the music only plays while Dorsal is running, as with the vendor's driver.
- **Screen colour** (mode 21) comes in this part too: the keys follow the colours on the monitor,
  streamed with `0x0E` the same way. The layout of its colours is still to be decoded from the
  vendor's driver.

## 4. Dorsal in the background

The AppImage becomes a resident driver.

- An icon in the tray, with a menu. On GNOME this needs the AppIndicator extension; the app says
  so when the tray is missing.
- One instance only: closing the window keeps it in the tray, and opening the AppImage again
  brings back the existing window.
- Optional start at login, straight to the tray.
- Light on resources while hidden: no 3D rendering, no polling the user does not need.
- The music runs without a window, and pauses for an instant whenever a setting is written, so
  the commands and the music packets never interleave.
- Sets the TFT clock when the keyboard connects and at login.
- The site warns when another program is already talking to the keyboard.

## 5. Profiles

Saved setups, switched from the app and from the tray. A profile holds:

- the lighting: effect, colour, brightness, speed, option and per-key colours;
- the keys: the normal and Fn layers;
- the macros: their content, not only which key runs them. Dorsal does not edit macros yet; the
  firmware reads them with `0x8B` and writes them with `0x0B` (up to 50).

Where they live:

- **On the keyboard, if the firmware allows it.** The command `0x04` / `0x84` selects a profile,
  and the key and per-key colour commands take a profile byte. Whether the X85 keeps a separate
  setup per profile, and for which of the three parts, is still to be tested.
- **Otherwise in Dorsal**, applied through the same diff-and-write path as restoring a backup. A
  part the keyboard cannot hold per profile falls back to this.
