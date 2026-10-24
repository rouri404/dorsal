// Developer mode: shows the simulation switch and the packet Log.
// On with VITE_X85_DEV=1 in .env (baked in at build time), `?dev` in the URL,
// or X85_DEV=1 when launching the AppImage (electron/main.cjs passes it as `?dev`).
export const isDevMode = () => import.meta.env.VITE_X85_DEV === "1" || new URLSearchParams(window.location.search).has("dev");
