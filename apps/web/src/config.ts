/**
 * Build-time public configuration. Values here are inlined into the JS
 * bundle (vite.config.ts define), so nothing secret may ever be added to
 * this file. The API base follows the same rule and is declared in
 * vite-env.d.ts; the chain id is a public network parameter.
 *
 * SIWE_DOMAIN is deliberately absent: the domain compared by the server is
 * the browser origin host, which is what the message must carry (exact
 * equality, docs/20-authentication.md W2). Deriving it from location.host
 * cannot drift from where the console is actually served.
 */
export const SIWE_CHAIN_ID: number = 1020;
