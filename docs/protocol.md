# Attack Shark X85 Pro protocol

Reverse engineered for interoperability from the qmk.top / gearhub.top web bundle
(`js/index.DBxGlqV7.js`) and confirmed with reads on the real keyboard. The code in this repository
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

The reads are confirmed on the keyboard; the writes follow the bundle and have not all been tested
on the hardware yet.

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
| 19 | screen functions (the knob column) |

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
