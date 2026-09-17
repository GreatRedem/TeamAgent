/// <reference types="vite/client" />

/**
 * Build-time API base, inlined by vite.config.ts from VITE_API_BASE_URL.
 * Declared here rather than imported from process.env so the type system
 * catches any use before the value exists.
 */
declare const __API_BASE_URL__: string;

interface ImportMetaEnv {
  readonly MODE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
