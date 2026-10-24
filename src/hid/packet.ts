// Packet framing for the RongYuan vendor interface (usage page 0xFFFF, usage 2).
// Every command is a 64-byte feature report with report ID 0. The firmware
// validates a one-byte checksum placed either at byte 7 or at byte 8.

export const REPORT_ID = 0;
export const REPORT_SIZE = 64;

export type Checksum = "bit7" | "bit8";

/** 255 - (sum of the covered bytes & 0xFF): `bit7` covers bytes 0..6, `bit8` covers 0..7. */
export function checksumByte(bytes: ArrayLike<number>, kind: Checksum): number {
  const end = kind === "bit7" ? 7 : 8;
  let sum = 0;
  for (let i = 0; i < end; i++) sum += bytes[i] ?? 0;
  return 255 - (sum & 255);
}

/** Pads `cmd` to 64 bytes and writes the checksum, mirroring the vendor app's encoder. */
export function encodePacket(cmd: ArrayLike<number>, kind: Checksum = "bit7"): Uint8Array {
  if (cmd.length > REPORT_SIZE) throw new Error(`packet too long: ${cmd.length} > ${REPORT_SIZE}`);
  const out = new Uint8Array(REPORT_SIZE);
  out.set(Array.from(cmd));
  out[kind === "bit7" ? 7 : 8] = checksumByte(out, kind);
  return out;
}

export function toHex(bytes: ArrayLike<number>, max = REPORT_SIZE): string {
  return Array.from(bytes)
    .slice(0, max)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
}
