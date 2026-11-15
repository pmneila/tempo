import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command, isPreview }) => ({
  plugins: [react()],
  // GitHub Pages serves a project site under the repository name.
  // Keep local development at / so existing browser storage stays accessible.
  base: command === "build" || isPreview ? "/tempo-timer/" : "/",
}));
