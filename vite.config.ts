import { defineConfig } from "vite";

export default defineConfig({
  // Relative asset paths, so the built site works from any folder (or straight off disk via a static server).
  base: "./",
  worker: { format: "es" },
  assetsInclude: ["**/*.bin"],
});
