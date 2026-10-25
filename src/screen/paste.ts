// An image from the clipboard (Ctrl+V). Copying a file in the file manager gives the file
// itself; "Copy image" in a browser gives only a still PNG, with the page's <img> in the
// HTML flavour, so the original (an animated GIF, say) is fetched from it when the site
// allows it.

const IMAGE = /^image\//;

/** True when the paste belongs to a text field, so it is left alone. */
export function pastingIntoText(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select") !== null);
}

async function fetchImage(url: string): Promise<File | null> {
  if (!/^(https?:|data:image\/)/.test(url)) return null;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const b = await r.blob();
    if (!r.ok || !IMAGE.test(b.type)) return null;
    const ext = b.type.split("/")[1].replace("jpeg", "jpg").replace(/\W.*/, "");
    const base = decodeURIComponent(new URL(url, location.href).pathname.split("/").pop() ?? "").replace(/\.\w+$/, "");
    return new File([b], `${url.startsWith("data:") || !base ? "image" : base}.${ext}`, { type: b.type });
  } catch {
    return null;
  }
}

export async function imageFromClipboard(data: DataTransfer): Promise<File | null> {
  const file = [...data.files].find((f) => IMAGE.test(f.type)) ?? null;
  // A file from the file manager is taken as is; a browser's "image.png" may be a still of a GIF.
  if (file && file.name && file.name !== "image.png") return file;

  const html = data.getData("text/html");
  const src = html ? new DOMParser().parseFromString(html, "text/html").querySelector("img")?.getAttribute("src") : null;
  const text = data.getData("text/plain").trim();
  const url = src ?? (/^https?:\/\/\S+$/.test(text) ? text : null);
  const fetched = url ? await fetchImage(url) : null;
  if (fetched) return fetched;

  return file;
}
