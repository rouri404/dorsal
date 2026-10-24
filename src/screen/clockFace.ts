// What the X85's TFT shows out of the box: date, time and status, drawn for previews
// when no image of the user's is known.

const DAYS = { pt: ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"], en: ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] };

export function drawClockFace(ctx: CanvasRenderingContext2D, w: number, h: number, lang: "pt" | "en" = "pt", now = new Date()) {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);
  const pad = (n: number) => String(n).padStart(2, "0");
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = "#9aa0a6";
  ctx.font = '600 13px "IBM Plex Sans", system-ui, sans-serif';
  ctx.textAlign = "left";
  ctx.fillText(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`, 10, 22);
  ctx.textAlign = "right";
  ctx.fillText(DAYS[lang][now.getDay()], w - 10, 22);

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.font = '600 31px "IBM Plex Sans", system-ui, sans-serif';
  ctx.fillText(`${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`, w / 2, 76);

  // Status chips along the bottom: connection and battery.
  const chips: [string, string][] = [["USB", "#2f6fdf"], ["100%", "#2fae5b"]];
  ctx.font = '600 11px "IBM Plex Sans", system-ui, sans-serif';
  let x = 10;
  for (const [label, color] of chips) {
    const tw = ctx.measureText(label).width + 12;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, h - 30, tw, 18, 4);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.fillText(label, x + tw / 2, h - 17);
    x += tw + 5;
  }
}
