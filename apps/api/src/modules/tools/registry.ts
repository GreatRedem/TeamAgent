import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import type { RiskTier } from "../../runtime/policy/capability.js";
import { vetEgressUrl, type DnsResolver } from "./ssrf.js";

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  truncated: boolean;
}

export interface HttpGetInput {
  url: URL;
  pinnedIp: string;
  timeoutMs: number;
  maxBytes: number;
  signal: AbortSignal;
}

export type HttpGet = (input: HttpGetInput) => Promise<HttpResponse>;

export interface ToolHandlerDeps {
  resolveDns: DnsResolver;
  httpGet: HttpGet;
}

export interface ToolHandlerContext {
  deps: ToolHandlerDeps;
  signal: AbortSignal;
}

export interface ToolDefinition {
  name: string;
  description: string;
  riskTier: RiskTier;
  /** Catalogue permission beyond the tool.execute gate (docs/07). */
  requiredPermission: string;
  inputSchema: Record<string, unknown>;
  egress: boolean;
  execute: (args: Record<string, unknown>, ctx: ToolHandlerContext) => Promise<unknown>;
}

const MAX_REDIRECT_HOPS = 3;
const MAX_RESPONSE_BYTES = 256_000;
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Default DNS: every address, v4 and v6. The caller vets all of them and
 * the request pins one — a second lookup at connect time would reopen the
 * rebinding hole (docs/17 C8).
 */
export async function defaultResolveDns(hostname: string): Promise<string[]> {
  const records = await lookup(hostname, { all: true });
  return records.map((r) => r.address);
}

/**
 * Single request, no redirect following, no caller-controlled headers. The
 * connection dials the vetted IP while SNI and Host stay the real hostname.
 */
export function defaultHttpGet(input: HttpGetInput): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const lib = input.url.protocol === "https:" ? https : http;
    const family = isIP(input.pinnedIp) === 6 ? 6 : 4;
    const port = input.url.port !== "" ? Number(input.url.port) : undefined;
    const request = lib.request(
      input.url,
      {
        method: "GET",
        lookup: (_hostname, _options, callback) => callback(null, input.pinnedIp, family),
        servername: input.url.hostname,
        headers: {
          host: input.url.host,
          "user-agent": "NuraAI-tool/1.0",
          accept: "*/*",
        },
        ...(port === undefined ? {} : { port }),
        timeout: input.timeoutMs,
        signal: input.signal,
      },
      (response) => {
        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(response.headers)) {
          if (typeof value === "string") headers[key.toLowerCase()] = value;
        }
        const chunks: Buffer[] = [];
        let bytes = 0;
        let truncated = false;
        response.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > input.maxBytes) {
            truncated = true;
            response.destroy();
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => {
          resolve({
            status: response.statusCode ?? 0,
            headers,
            body: Buffer.concat(chunks).toString("utf8"),
            truncated,
          });
        });
        response.on("error", reject);
      },
    );
    request.on("timeout", () => request.destroy(new Error("HTTP_TIMEOUT")));
    request.on("error", reject);
    request.end();
  });
}

export const defaultToolHandlerDeps: ToolHandlerDeps = {
  resolveDns: defaultResolveDns,
  httpGet: defaultHttpGet,
};

async function executeHttpFetch(
  args: Record<string, unknown>,
  ctx: ToolHandlerContext,
): Promise<unknown> {
  const rawUrl = args["url"];
  if (typeof rawUrl !== "string") throw new Error("INVALID_ARGUMENTS: url must be a string");
  let current = rawUrl;
  const hops: string[] = [];
  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop += 1) {
    // Re-vetted on every hop: a redirect to an internal address is the
    // same attack as a direct one.
    const vetted = await vetEgressUrl(current, ctx.deps.resolveDns).catch((error: unknown) => {
      throw new Error(`SSRF_DENIED: ${(error as Error).message}`);
    });
    const pinnedIp = vetted.pinnedIps[0];
    if (pinnedIp === undefined) throw new Error("SSRF_DENIED: no vetted address");
    const response = await ctx.deps.httpGet({
      url: vetted.url,
      pinnedIp,
      timeoutMs: REQUEST_TIMEOUT_MS,
      maxBytes: MAX_RESPONSE_BYTES,
      signal: ctx.signal,
    });
    const location = response.headers["location"];
    if (
      response.status >= 300 &&
      response.status < 400 &&
      location !== undefined &&
      hop < MAX_REDIRECT_HOPS
    ) {
      current = new URL(location, vetted.url).toString();
      hops.push(current);
      continue;
    }
    return {
      status: response.status,
      url: vetted.url.toString(),
      body: response.body,
      truncated: response.truncated,
      redirects: hops,
    };
  }
  throw new Error("HTTP_TOO_MANY_REDIRECTS");
}

export const httpFetchTool: ToolDefinition = {
  name: "http.fetch",
  description: "Fetch a public URL over GET. SSRF-guarded; redirects re-vetted.",
  riskTier: "read_only",
  requiredPermission: "browser.read",
  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string", maxLength: 2048 },
    },
    required: ["url"],
    additionalProperties: false,
  },
  egress: true,
  execute: executeHttpFetch,
};

const BUILTINS: ToolDefinition[] = [httpFetchTool];

export function getBuiltinTool(name: string): ToolDefinition | undefined {
  return BUILTINS.find((t) => t.name === name);
}

export function listBuiltinTools(): ToolDefinition[] {
  return [...BUILTINS];
}
