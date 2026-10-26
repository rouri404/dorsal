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
- **It runs in a virtual machine.** A USB device stays with the host until you pass it through to the VM (the USB menu in VirtualBox, VMware or virt-manager). While it is passed through, the host stops receiving its keys. Inside the VM, `lsusb | grep 3151` should list `3151:5002`.
- **Another program holds the keyboard.** Close other configurators or browser tabs connected to it.

## Images are refused

The firmware only accepts screen uploads over the **USB cable**. Over the 2.4G dongle the upload fails; the app says so and disables the button.

## Uploads are slow or stop in the background

Uploads run their waits in a worker and hold a Web Lock, so a background tab keeps its pace. If an upload still stalls:

- Use an up-to-date build: older builds paused in hidden tabs, and older AppImages paused for about a second at a time while minimised.
- If you run the site in a browser with aggressive power saving (a "memory saver" or "energy saver" mode), add the site to its exceptions.

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

## The keys do not follow the music

- **On the site, "Som do computador" asks for a command.** Browsers on Linux do not list the
  computer's own sound. Run this once (no root), then try again:

  ```bash
  curl -fsSL https://dorsal.cotoo.dev/music.sh | sh
  ```

  The AppImage does not need it. Then close the browser completely and open it again: it loses
  the sound server when PipeWire restarts, and lists no input until it is reopened. When it asks
  for the microphone, pick "Dorsal": that input is the computer's sound.
- **The bars move but the keys do not.** Apply a music mode to the keyboard first: the bars are
  sent only while the keyboard is in "Música: clássico" or "Música: EDM".
- **A microphone hears nothing.** "Microfone padrão" is a microphone, not the computer's sound.
- **The music stops when the window closes.** In the AppImage, closing the window keeps Dorsal
  in the tray, but only if the desktop shows tray icons: on GNOME, enable the AppIndicator
  extension. On the site, the tab must stay open (it can be in the background).
