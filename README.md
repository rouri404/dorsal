<h1 align="center">
  <img src="public/favicon.svg" alt="" width="56" valign="middle">&nbsp;Dorsal
</h1>
<p align="center">An open configurator for the <strong>Attack Shark X85 Pro</strong> on Linux: TFT screen, keys, lighting and battery, with no Windows and no driver.</p>
<p align="center">
  <img alt="WebHID" src="https://img.shields.io/badge/WebHID-Chrome%20%C2%B7%20Edge%20%C2%B7%20Brave-4285F4?style=flat&logo=googlechrome&logoColor=white" />&nbsp;
  <img alt="Electron" src="https://img.shields.io/badge/Electron-33.2-47848F?style=flat&logo=electron&logoColor=white" />&nbsp;
</p>
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

**Dorsal** reimplements the keyboard's protocol from scratch, through reverse engineering for interoperability, and ships the full configurator in three forms from the same code: a **website** that runs in the browser, an **AppImage** with its own window, and **X85 Screen**, a small window just for the screen.

**Features:**

- **TFT screen:** sends images and GIFs of up to 60 frames (128 × 128, RGB565), framed by dragging and zooming, and sets the keyboard's clock. Uploads keep going with the window in the background.
- **Keys:** remaps the normal layer and the layer while holding Fn, plus the knob (press and turn). Changed keys stand out, with a way back to factory defaults.
- **Lighting:** the 21 key effects and the 5 side-light effects, with colour, brightness and speed, animated on the 3D model before you apply them.
- **System:** polling rate (125 to 8000 Hz), debounce, sleep and deep sleep on 2.4G and Bluetooth, JSON backup and factory reset.
- **3D keyboard:** a model faithful to the product (gradient keycaps, knob, live TFT), with a camera that moves to whatever each section edits.
- **Two languages:** Portuguese and English, key, function and effect names included.


### Documentation

The protocol is documented in [`docs/protocol.md`](docs/protocol.md) (in Portuguese), with every command confirmed against the real keyboard.

**Main topics:**
- **Identification**: USB IDs, configuration interface and firmware ID.
- **Framing**: the feature report format and both checksum types.
- **Commands**: polling, profile, debounce, lighting, side light, key matrix, Fn layer and sleep.
- **Screen**: handshake, upload in chunks and pixel format.


> [!NOTE]
> Pixels are sent as big-endian RGB565, column by column, only inside the rectangle that holds non-black pixels. The clock is a separate command (`0x28`). Details in [`docs/protocol.md`](docs/protocol.md#tela-tft-comandos-compartilhados-classe-f6).

<details>
<summary><strong>Manual install (step by step)</strong></summary>

1. **Access rule:** copy `udev/70-attack-shark-x85.rules` to `/etc/udev/rules.d/`, reload udev and replug the cable. On Fedora Silverblue `/etc` is writable; no rpm-ostree needed.
2. **Dependencies:** `npm install` (Node 22 or newer).
3. **Website:** `npm run dev` and open the address in a browser with WebHID.
4. **AppImage:** `npm run appimage`, then `chmod +x release/X85-Configurator-0.1.0.AppImage` and open the file.

</details>

> [!TIP]
> No keyboard at hand? Use **demo mode**: `?demo` in the address or `X85_DEMO=1` when opening the AppImage. It replays real answers from an X85 Pro, and writes stay in memory.


> [!IMPORTANT]
> **Use the USB cable.** The screen only accepts images over the cable, a firmware limit, and settings over the 2.4G dongle are not implemented yet.

---

### Distribution

1. **AppImages:** `npm run appimage` and `npm run appimage:mini` build both files into `release/` and `release-mini/`.
2. **Website:** `npm run build` builds `dist/`. On Vercel, `vercel.json` sends every route that is not a file to `index.html`.
3. **Downloads:** the landing page links to `/X85-Configurator-<version>.AppImage` and `/X85-Screen-<version>.AppImage` at the site root. Publish both files alongside `dist/`.


### Known Limitations

- **2.4G dongle:** over the dongle, settings go through another channel, not implemented yet.
- **Fn layer:** Fn+Enter, Fn+Backspace and Fn+] have functions not identified yet; they show as "?".
- **Out of scope:** macros and firmware updates, because of the risk of bricking the keyboard.

---

### Disclaimer

Independent project, not affiliated with Attack Shark. Attack Shark and X85 are trademarks of their owners. No proprietary code was copied: the protocol was reimplemented from the observed behaviour of the keyboard and the official website. "Dorsal" is a working name; the name and logo live in `src/brand/`.

---

<p align="center">
  Made on Fedora Silverblue, for anyone with an X85 Pro who would rather not boot Windows.
</p>
