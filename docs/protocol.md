# Attack Shark X85 Pro protocol

Reverse engineered for interoperability from the qmk.top / gearhub.top web bundle
(`js/index.DBxGlqV7.js`) and confirmed on the real keyboard. The code in this repository
is an independent reimplementation: none of the proprietary code was copied.

## Identification

| Item | Value |
|---|---|
| USB (cable) | `3151:5002` "Gaming Keyboard" |
| USB (2.4G dongle) | `3151:5006` "2.4G Wireless Keyboard" |
| Configuration interface | interface 2, usage page `0xFFFF`, usage `2`, 64-byte *feature reports* only, no report ID |
| Firmware ID (`0x8F`) | **3451** (`7b 0d 00 00`), which is not in the qmk.top catalogue |
| Chip / screen (`0xAD`) | `"RY5060"`, screen version `0x0102`, flash `0x0100` |

qmk.top has no entry for ID 3451. That is why it does not know the screen's resolution and shows
"当前设备没有有效的屏幕分辨率配置" (the device has no valid screen resolution setting).
The upload itself is plain HID: the "IOT driver" (`iot_manager_rs.exe`) only unlocks a check in the
interface (`isUseIOTSDK` + login).

Over the 2.4G dongle the same collection exists, but every configuration command is answered with
zeros, so the app only talks to the cable.

## Framing

Each command is a 64-byte feature report (`sendFeatureReport(0, …)`). When there is an answer, it
is read about 10 ms later with `receiveFeatureReport(0)`.

Checksum:
- `bit7`: `byte[7] = 255 − (sum(byte[0..6]) & 0xFF)`, the default.
- `bit8`: `byte[8] = 255 − (sum(byte[0..7]) & 0xFF)`, used by the lighting commands.

Commands the firmware does not implement come back as an **echo** of the packet sent.

## Commands (YC3123/RY5088 family, class `an` in the bundle)

| Read | Write | Function | Format |
|---|---|---|---|
| `0x8F` | – | identity | `[1..4]` = ID uint32 LE, `[7..8]` = version |
| `0x83` | `0x03` | polling rate | `[2]`: 0=8k, 1=4k, 2=2k, 3=1k, 4=500, 5=250, 6=125 |
| `0x84` | `0x04` | profile | `[1]` |
| `0x85` | – | power saving | `[1] == 1` |
| `0x86` | `0x06` | debounce | `[1]` |
| `0x87` | `0x07` (bit8) | main RGB | `[1]` mode, `[2]` = 4−speed, `[3]` brightness, `[4]` = (option<<4)\|(7 normal / 8 rainbow), `[5..7]` RGB |
| `0x88` | `0x08` (bit8) | side light | the same, but speed is direct; white is written as `fa ff fa` |
| `0x8A` | `0x0A` | key matrix | read: `[0x8A, profile, 0xFF, page 0..7, layer]` → 64 raw bytes per page |
| `0x90` | `0x10` | Fn layer | read: `[0x90, os, fnProfile, 0xFF, page]` |
| `0x91` | `0x11` | sleep | uint16 LE at `[8]` BT, `[10]` 2.4G, `[12]` deep BT, `[14]` deep 2.4G (seconds) |
| – | `0x01` | factory reset | |

Write a key: `[0x0A, profile, pos, 0, 0, 1, layer, chk, v0, v1, v2, v3]`.
Write a key on the Fn layer: `[0x10, os, fnProfile, pos, 0, 0, 0, chk, v0..v3]`.

Every command above is confirmed on the keyboard. Each write (`0x03`, `0x06`, `0x07`, `0x08`,
`0x0A`, `0x10`, `0x11`) was read back with the matching command and then undone. The light and a
remapped key were also checked by eye and by typing. Factory reset (`0x01`) has not been run.

### Matrix

128 positions of 4 bytes, laid out **by column**, with 6 rows: `pos = column*6 + row`.
The X85 uses 16 columns. Values:

| Type | Format |
|---|---|
| 0 | key `[0, modifiers, HID usage, usage2]`, or `[0, usage, 0, 0]` |
| 1 | mouse |
| 2 | system |
| 3 | consumer `[3, 0, lo, hi]` |
| 9 | macro `[9, mode, index, 0]` |
| 10 | Fn / locks |
| 13 | lighting control |
| 14 | connection (Bluetooth 1–3, 2.4G) |
| 19 | screen functions (the knob column) |

Functions found in the factory Fn layer, named after the keyboard's manual (Fn+Enter and Fn+] are
not in it and were checked by pressing them):

| Value | Factory key | Effect |
|---|---|---|
| `[13, 1, 0, 0]` | Fn+\ | next light effect |
| `[13, 2, 1/2, 0]` | Fn+↑ / Fn+↓ | brightness up / down |
| `[13, 3, 1/2, 0]` | Fn+← / Fn+→ | speed down / up |
| `[13, 5, 1, 0]` | Fn+Enter | next light colour |
| `[10, 9, 0, 0]` | Fn+] | turns the key light off |
| `[10, 3, 0, 0]` | Fn+Super | locks the Super key |
| `[10, 8, 0, 0]` | Fn+Backspace | shows the battery level (wireless only) |
| `[10, 2, 0, 0]` | Fn+Esc | factory reset, held for 3 s |
| `[14, 0, n, 0]` | Fn+1…4 | Bluetooth 1–3 (`n` 0–2), 2.4G (`n` 5); held, pairs |
| `[3, 0, 0x70/0x6F, 0]` | Fn+F1 / Fn+F2 | monitor brightness down / up |
| `[0, 0, 0xE3, 0x07]` | Fn+F3 | Super+D (show desktop) |
| `[0, 0, 0xE3, 0x2B]` | Fn+F4 | Super+Tab (switch windows) |
| `[0, 0, 0xE3, 0x37]` | Fn+F5 | Super+. (emoji) |
| `[0, 0, 0x46, 0]` | Fn+F6 | Print Screen |
| `[3, 0, …]` | Fn+F7…F12 | previous, play/pause, next, mute, volume −, volume + |

## Lighting beyond the effect list

From class `an` in the vendor web app and from its IOT driver (`iot_manager_rs`, macOS build
0.1.7, which keeps its symbol names). Run on the keyboard so far: the effect options, per-key colours
(`0x8C`/`0x0C`), per-key animation (`0x12` with mode 25) and the music stream; the rest is read from the code. The plan that uses them is in [`roadmap.md`](roadmap.md).

Modes of `0x07` (byte 1), with the vendor's names:

| Mode | Name | Notes |
|---|---|---|
| 0–12, 14–19, 23, 24 | the effects in the app | |
| 13 | `LightUserPicture` | per-key colours; byte 4 = option << 4, RGB sent as `00 c8 c8` |
| 20 | `LightMusicFollow3` | music, "Classic"; needs the host stream below |
| 21 | `LightScreenColor` | follows the colours on the monitor; byte 4 = 0 |
| 22 | `LightMusicFollow2` | music, "EDM"; needs the host stream below |
| 25 | `LightUserColor` | plays the animation uploaded with `0x12` (the vendor app offers "dynamic light" on boards that list this mode) |

Byte 4 of `0x07`: the high nibble is an option per effect (the list is in `src/protocol/effects.ts`); the low nibble is
7 for the custom RGB, 8 for rainbow, 0–6 for a preset colour. In the music modes it is 0 for
rainbow and 4 for the custom colour.

| Cmd | Function | Format |
|---|---|---|
| `0x8C` | read per-key colours | `[0x8C, profile, 0xFF, page 0..5]` → 64 bytes per page; key `pos` is RGB at `pos*3` |
| `0x0C` | write per-key colours | `[0x0C, profile, 0xFF, page 0..6, len, last, 0, chk, …56 bytes]`; `len` 56, or 42 and `last` 1 on page 6 |
| `0x12` | per-key animation | `[0x12]` starts it (then wait 300 ms), then per frame and page: `[0x12, frame, page 0..6, 1, frames, delayLo, delayHi, chk, …56 bytes]`; the colours are laid out as in `0x0C` |
| `0x0D` | music stream | `[0x0D, 0, 0, 0, 0, 0, 0, chk, h0 … h41]` |
| `0x0E` | screen-colour stream | `[0x0E, …colours]`; the colour layout is not decoded yet |
| `0x8B` / `0x0B` | read / write a macro | up to 50; format not documented here yet |

All use `bit7`.

The music stream was run on the keyboard on 2026-10-25, in modes 20 and 22. It worked both with
synthetic patterns and with live audio, with no failed packets, and the light was restored
afterwards.
- **Heights:** `h0 … h41` are 42 bands, low to high, each a height from 0 to 6. The vendor's
  driver computes them as `round(clamp(level, 0, 1) × 6)`.
- **Timing:** the driver sends one packet every 20 ms.
- **Who draws:** the keyboard draws the bars itself; it has no microphone.

### How each effect moves

Every effect and option was filmed on the keyboard on 2026-10-25, in red at speed 2 and
brightness 4. The video was read as light per region of the board over time. The preview in
`src/app/lightFx.ts` follows these numbers; other speeds scale them by the vendor's roughly even
steps (not filmed).

| Effect | On the keyboard |
|---|---|
| Breathing | dark → full → dark every 1.2 s |
| Neon | the whole board turns through the hues every ~2.6 s, ignoring the colour |
| Wave, Lines | lit board; a dark dip about 18 keys long sweeps it 3 times a second in the option's direction (Wave: right, left, down = towards the front, up). With the rainbow there is no dip, and the colours cross the board in about 1.5 s (seen on the keyboard on 2026-10-25) |
| Circular wave | lit board; one dark sector turns 3 times a second (option 0 anticlockwise, 1 clockwise, seen from above) |
| Kaleidoscope | lit board; dark rings move out from the centre (option 0) or in (option 1), 3 times a second |
| Snake | a run of ~9 keys over a faint board. Zigzag: the number row left to right, the next row back, ~12 keys/s. Spiral: clockwise round the edge, ~23 keys/s |
| Converge | light spreads from a point until the board is lit, then darkness spreads from it; ~1.9 s a cycle |
| Train | a train ~20 keys long crosses left to right in ~0.6 s, then comes back from the right; ~4.2 s for both |
| Meteor | a streak crosses one row left to right in ~0.25 s, stays lit ~0.7 s and fades; a new row every ~0.65 s |
| Raindrop | about a third of the keys lit at random, each fading in ~0.6 s |
| Rain | a dim board with drops |
| Ripple, Reactive, Laser | dark until a key is pressed (Ripple: a ring spreads from the key) |
| Reactive (off) | lit; pressed keys go dark |
| Sine wave, Rainbow, Fireworks | with one colour, almost steady and lit (Fireworks: faint rings) |

Per-key animation, run on the keyboard on 2026-10-25:
- **Upload:** 20 frames took 2 s and 200 frames took 17 s (about 85–100 ms a frame). Every
  packet was accepted.
- **Playing:** uploading does not change the mode. In mode 25 the keyboard plays the frames in a
  loop, with each frame's delay in ms.
- **Length:** on the first long upload, 200 frames all played (the vendor editor's limit; `frame`
  is one byte). But the start command does not clear the whole area: on later uploads, the frames
  past about 100 kept data from earlier ones, as if written over without erasing. With all-white
  frames, 100 played clean, while 160, 167 and 170 flashed at the end of each loop, and 200 showed
  the earlier animation for part of it. Dorsal uses at most 100 frames, of 20 to 130 ms.
- **Storage:** the animation survives unplugging the cable.
- **From the studio** (same day): a two-layer effect of 200 frames, stored through the lighting
  tab, took 18 s and read back as mode 25; its last frames showed the problem above. The same
  wave in 100 frames of 40 ms took 9.6 s and played clean.
- **Brightness:** in mode 25 the brightness byte is accepted and reads back (1 and 4 tried).
  Whether it dims the frames is still to be checked by eye; Dorsal sends the frames at full
  colour.

Side light: `0x88` / `0x08` answer and read back, but the X85 has no side strip (checked by
eye on the user's keyboard).

## TFT screen (shared commands, class `F6`)

| Cmd | Function |
|---|---|
| `0xA5` | start of an upload (handshake), 16-bit mode |
| `0x25` | data, 56 bytes of pixels per packet |
| `0x28` | clock: `[8..9]` year BE, `[10]` month, `[11]` day, `[12]` h, `[13]` min, `[14]` s |
| `0xAC` | erases the whole screen flash (answers `aa aa 55 55`); not used by the app |
| `0xAD` | screen and flash versions |

`0xA5` handshake:
```
[0xA5, frame, total, delay, len0, len1, 0, chk,
 left, top, right, bottom, leftHi, topHi, rightHi, bottomHi, len2, len3, slot]
```
Repeated up to 10 times, waiting 100 ms before sending and before reading, until `answer[1] == 1`.

`0x25` data:
```
[0x25, frame, total, delay, chunkLo, chunkHi, len, chk, …56 bytes]
```
Sent with 1 ms between packets.

Pixels: big-endian RGB565, scanned **by column** (x outer, y inner), inside the rectangle that
holds the non-black pixels (for animations, the union of the rectangles of every frame).
- Still image: `frame = slot`, `total = 1`, `slot` at `[18]`.
- Animation: frames `0..n−1`, `delay` in ms (1–255), `slot = 0`.

Uploads only work over the **USB cable**. The resolution is neither in the firmware nor in the
catalogue; the default is 128×128, the usual size of a 0.85" TFT.
