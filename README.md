<h1 align="center">
  <img src="public/favicon.svg" alt="" width="56" valign="middle">&nbsp;Dorsal
</h1>
<p align="center">An open configurator for the <strong>Attack Shark X85 Pro</strong> on Linux: TFT screen, keys, lighting and battery, with no Windows and no driver.</p>
<p align="center">
  <img alt="WebHID" src="https://img.shields.io/badge/WebHID-Chrome%20%C2%B7%20Edge%20%C2%B7%20Brave-4285F4?style=flat&logo=googlechrome&logoColor=white" />&nbsp;
  <img alt="Electron" src="https://img.shields.io/badge/Electron-33.2-47848F?style=flat&logo=electron&logoColor=white" />&nbsp;
</p>
<p align="center"><a href="https://dorsal.cotoo.dev"><strong>dorsal.cotoo.dev</strong></a></p>
<p align="center"><strong>English</strong> · <a href="README.pt.md">Português</a></p>

<br>

<p align="center"><img src="docs/images/keyboard.png" alt="The X85 Pro in 3D, with rainbow lighting" width="760"></p>

### Quick Start

```bash
# Keyboard access (once)
sudo cp udev/70-attack-shark-x85.rules /etc/udev/rules.d/
sudo udevadm control --reload && sudo udevadm trigger --subsystem-match=hidraw

# Install and open
npm install
npm run dev        # http://localhost:5173, in Chrome, Edge, Chromium or Brave
```

---

### About

The X85 Pro is officially configured through **qmk.top**, a website that talks to the keyboard over WebHID, and through a Windows executable. On Linux neither works: the system only lets root open `hidraw` devices. On top of that, the X85's firmware (ID **3451**) is missing from the site's catalog, so the screen editor never shows up.

**Dorsal** reimplements the keyboard's protocol from scratch, through reverse engineering for interoperability, and ships the full configurator in three forms from the same code: a **website** that runs in the browser, an **AppImage** with its own window, and **Dorsal Screen**, a small window just for the screen.

**Features:**

- **TFT screen:** sends images and GIFs of up to 60 frames (128 × 128, RGB565), framed by dragging and zooming, and sets the keyboard's clock. Uploads keep going with the window in the background.
- **Keys:** remaps the normal layer and the layer while holding Fn, plus the knob (press and turn). Changed keys stand out, with a way back to factory defaults.
- **Lighting:** the 21 key effects and the 5 side-light effects, with colour, brightness and speed, animated on the 3D model before you apply them.
- **System:** polling rate (125 to 8000 Hz), debounce, sleep and deep sleep on 2.4G and Bluetooth, JSON backup and restore, and factory reset.
- **3D keyboard:** a model faithful to the product (gradient keycaps, knob, live TFT), with a camera that moves to whatever each section edits.
- **Two languages:** Portuguese and English, key, function and effect names included.

### Dorsal Screen

<img src="public/landing/en/mini.png" alt="Dorsal Screen: the keyboard's screen in 3D, the zoom and the send buttons" width="300" align="right">

Only want to change the picture on the keyboard? **Dorsal Screen** is a small window that does just that: choose an image or a GIF, frame it on the 3D screen, and send it. It shares the screen editor with the configurator, but skips reading the keyboard's other settings, so it opens faster.

- **AppImage:** `npm run appimage:mini` builds `release-mini/Dorsal-Screen-<version>.AppImage`.
- **Browser:** [`dorsal.cotoo.dev/mini.html`](https://dorsal.cotoo.dev/mini.html), with `?lang=en` or `?lang=pt`.
- **Details:** [`docs/dorsal-screen.md`](docs/dorsal-screen.md).

<br clear="right">

### Documentation

| Guide | What it covers |
| --- | --- |
| [Architecture](docs/architecture.md) | Routes, device layer, transport, screen pipeline, the 3D board, languages, Electron shell |
| [Development](docs/development.md) | Setup, scripts, environment variables, demo and developer modes, tests |
| [Deployment](docs/deployment.md) | Publishing on `dorsal.cotoo.dev` and distributing the AppImages |
| [Dorsal Screen](docs/dorsal-screen.md) | The mini app for the TFT |
| [Troubleshooting](docs/troubleshooting.md) | Keyboard not found, stalled uploads, slow 3D |

The protocol is documented in [`docs/protocol.md`](docs/protocol.md), with reads and writes confirmed on the real keyboard.

**Main topics:**
- **Identification**: USB IDs, configuration interface and firmware ID.
- **Framing**: the feature report format and both checksum types.
- **Commands**: polling, profile, debounce, lighting, side light, key matrix, Fn layer and sleep.
- **Screen**: handshake, upload in chunks and pixel format.


> [!NOTE]
> Pixels are sent as big-endian RGB565, column by column, only inside the rectangle that holds non-black pixels. The clock is a separate command (`0x28`). Details in [`docs/protocol.md`](docs/protocol.md#tft-screen-shared-commands-class-f6).

<details>
<summary><strong>Manual install (step by step)</strong></summary>

1. **Access rule:** copy `udev/70-attack-shark-x85.rules` to `/etc/udev/rules.d/`, reload udev and replug the cable.
2. **Dependencies:** `npm install` (Node 22 or newer).
3. **Website:** `npm run dev` and open the address in a browser with WebHID.
4. **AppImage:** `npm run appimage`, then `chmod +x release/Dorsal-0.1.0.AppImage` and open the file.

</details>

> [!TIP]
> No keyboard at hand? Use **demo mode**: `?demo` in the address or `X85_DEMO=1` when opening the AppImage. It replays real answers from an X85 Pro, and writes stay in memory.


> [!IMPORTANT]
> **Use the USB cable.** The screen only accepts images over the cable, a firmware limit, and settings over the 2.4G dongle are not implemented yet.

---

### Distribution

1. **AppImages:** `npm run appimage` and `npm run appimage:mini` build both files into `release/` and `release-mini/`.
2. **Website:** `npm run build` builds `dist/`. On Vercel, `vercel.json` sends every route that is not a file to `index.html`.
3. **Downloads:** the landing page links to both AppImages at the site's root, or at `VITE_DOWNLOAD_BASE` (a GitHub release, for example). See [`docs/deployment.md`](docs/deployment.md).


### Known Limitations

- **2.4G dongle:** over the dongle, settings go through another channel, not implemented yet.
- **Out of scope:** macros and firmware updates, because of the risk of bricking the keyboard.

---

### Contributing

Issues, protocol findings and pull requests are welcome: see [`CONTRIBUTING.md`](CONTRIBUTING.md).

---

### License

Dorsal is free software under the [GNU General Public License v3.0](LICENSE), or any later version: you can use, study, change and share it, as long as what you share stays under the same license.

The interface components in `src/components/motion` and `src/lib` come from [beUI](https://beui.dev), under the [MIT license](src/components/motion/LICENSE).

---

### Disclaimer

Independent project, not affiliated with Attack Shark. Attack Shark and X85 are trademarks of their owners. No proprietary code was copied: the protocol was reimplemented from the observed behaviour of the keyboard and the official website.

---

<p align="center">
  For anyone with an X85 Pro who would rather not boot Windows.
</p>
