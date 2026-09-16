import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Built to static assets and served by nginx. The API does not serve the
// frontend (docs/19-tech-stack.md).
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: process.env.SOURCEMAP === "true",
    emptyOutDir: true,
  },
  server: { port: 5173 },
});
