import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Absolute paths: routes like /en/app/keys load their assets from the root, on the web and
// in the AppImages (which serve dist from app://x85/).
export default defineConfig({
  base: "/",
  plugins: [react(), tailwindcss()],
  // Two pages: the site (landing and configurator, routed in the app) and the mini screen app.
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        mini: fileURLToPath(new URL("./mini.html", import.meta.url)),
      },
    },
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
