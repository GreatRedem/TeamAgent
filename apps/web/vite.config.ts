import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Built to static assets and served by nginx. The API does not serve the
// frontend (docs/19-tech-stack.md).
//
// In production nginx routes /auth, /teams, /users, and /health to the API, so
// the browser sees one origin: no CORS in the app either way (docs/19 puts CORS
// on the proxy, and it must not appear in this codebase). In dev the same
// routing is reproduced by the proxy below, so the browser never learns a
// second origin and nothing changes between environments.
export default defineConfig(() => {
  // Same-origin by default; only a split deployment needs to override this,
  // and then the value is the proxy's origin, never the API's direct address.
  // Defined rather than imported from an env module so the value is inlined at
  // build time and there is no runtime window where it is unset.
  const apiBaseUrl = process.env.VITE_API_BASE_URL ?? "";

  return {
    plugins: [react()],
    define: {
      __API_BASE_URL__: JSON.stringify(apiBaseUrl),
    },
    build: {
      outDir: "dist",
      sourcemap: process.env.SOURCEMAP === "true",
      emptyOutDir: true,
    },
    server: {
      port: 5173,
      proxy: {
        // Mirror the nginx boundary for development. Never /v1: the API
        // registers its routes unprefixed.
        "/auth": "http://127.0.0.1:3000",
        "/teams": "http://127.0.0.1:3000",
        "/users": "http://127.0.0.1:3000",
        "/health": "http://127.0.0.1:3000",
      },
    },
  };
});
