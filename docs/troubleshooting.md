# Troubleshooting

## The keyboard is not found

**Symptom**: "Connect keyboard" does nothing, or the browser's list is empty.

- **The udev rule is missing.** Linux only lets root open `hidraw` devices. Install the rule and replug the cable:

  ```bash
  curl -fsSL https://dorsal.cotoo.dev/udev.sh | sudo sh
  ```

  To check, `getfacl /dev/hidraw*` should list your user with `rw` on the keyboard's devices.
- **The browser has no WebHID.** Firefox and Safari do not support it. Use Chrome, Edge, Chromium or Brave, or the AppImage.
- **A Flatpak browser cannot see devices.** Give it device access, for example `flatpak override --user --device=all com.brave.Browser`, then restart it.
- **Only the 2.4G dongle is connected.** The dongle answers no configuration command, so the app only connects through the USB cable. Plug the cable in, even with the dongle still connected.
- **Another program holds the keyboard.** Close other configurators or browser tabs connected to it.

## Images are refused

The firmware only accepts screen uploads over the **USB cable**. Over the 2.4G dongle the upload fails; the app says so and disables the button.

## Uploads are slow or stop in the background

Uploads run their waits in a worker and hold a Web Lock, so a background tab keeps its pace. If an upload still stalls:

- Use an up-to-date build: older builds paused in hidden tabs.
- In the AppImages, background throttling is off. If you run the site in a browser with aggressive power saving (a "memory saver" or "energy saver" mode), add the site to its exceptions.

## The 3D view is slow

- **The GPU is not used.** Chromium blocklists some Linux drivers and falls back to software rendering. The AppImages ignore the blocklist; in a browser, check `chrome://gpu` and enable hardware acceleration in the settings.
- The board already adapts: it draws only while something moves and lowers its resolution when frames are slow.

## A GIF looks wrong

Each GIF frame is composited over the previous ones, honouring the "restore to background" and "restore to previous" disposals. If a GIF still looks wrong in the preview, it will look the same on the keyboard; please share the file in an issue.

## The AppImage does not start

- Make it executable: `chmod +x Dorsal-<version>.AppImage`.
- AppImages need FUSE. If yours does not have it, run `./Dorsal-<version>.AppImage --appimage-extract-and-run`.

## The last image is not shown

The last image sent is remembered per address (`localStorage`): the site, the AppImage and the mini app each keep their own. It appears again after the next upload from that place.
