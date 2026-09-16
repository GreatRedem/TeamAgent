import { BlockList, isIP } from "node:net";

export type DnsResolver = (hostname: string) => Promise<string[]>;

const DENIED_SUBNETS_V4 = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "100.64.0.0/10",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.0.0.0/24",
  "192.0.2.0/24",
  "192.88.99.0/24",
  "192.168.0.0/16",
  "198.18.0.0/15",
  "198.51.100.0/24",
  "203.0.113.0/24",
  "224.0.0.0/4",
  "240.0.0.0/4",
  "255.255.255.255/32",
];

const DENIED_SUBNETS_V6 = [
  "::/128",
  "::1/128",
  "64:ff9b::/96",
  "100::/64",
  "2001::/32",
  "2001:db8::/32",
  "2002::/16",
  "fc00::/7",
  "fe80::/10",
  "ff00::/8",
];

const DENIED_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".lan",
  ".test",
  ".example",
  ".invalid",
];

function buildBlockList(): BlockList {
  const list = new BlockList();
  for (const subnet of DENIED_SUBNETS_V4) {
    const [address, prefix] = subnet.split("/") as [string, string];
    list.addSubnet(address, Number(prefix), "ipv4");
  }
  for (const subnet of DENIED_SUBNETS_V6) {
    const [address, prefix] = subnet.split("/") as [string, string];
    list.addSubnet(address, Number(prefix), "ipv6");
  }
  return list;
}

const DENIED = buildBlockList();

function unwrapMappedV6(address: string): { family: "ipv4" | "ipv6"; address: string } {
  const lower = address.toLowerCase();
  if (lower.startsWith("::ffff:")) {
    const rest = address.slice("::ffff:".length);
    if (isIP(rest) === 4) return { family: "ipv4", address: rest };
  }
  return { family: "ipv6", address };
}

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return false;
  if (family === 4) return !DENIED.check(address, "ipv4");
  const unwrapped = unwrapMappedV6(address);
  if (unwrapped.family === "ipv4") return !DENIED.check(unwrapped.address, "ipv4");
  return !DENIED.check(address, "ipv6");
}

export interface VettedUrl {
  url: URL;
  /** Resolved-before-connect IPs; the handler must pin one of these. */
  pinnedIps: string[];
}

/**
 * Egress network controls for HTTP tooling (docs/17 C8): http(s) only, no
 * credentials in the URL, no local/special hostnames, and every resolved
 * address must be public — otherwise the call is denied before any packet
 * is sent. Resolution failures fail closed.
 */
export async function vetEgressUrl(rawUrl: string, resolve: DnsResolver): Promise<VettedUrl> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("SSRF_DENIED: malformed URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("SSRF_DENIED: only http and https are allowed");
  }
  if (url.username !== "" || url.password !== "") {
    throw new Error("SSRF_DENIED: credentials in URL are not allowed");
  }
  const hostname = url.hostname.toLowerCase();
  if (hostname.length === 0 || hostname.includes("%") || hostname.includes("_")) {
    throw new Error("SSRF_DENIED: invalid hostname");
  }
  if (!hostname.includes(".") || hostname === "localhost") {
    throw new Error("SSRF_DENIED: local hostname");
  }
  if (DENIED_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) {
    throw new Error("SSRF_DENIED: special-use hostname");
  }

  let candidates: string[];
  if (isIP(hostname) !== 0) {
    candidates = [hostname];
  } else {
    try {
      candidates = await resolve(hostname);
    } catch {
      throw new Error("SSRF_DENIED: DNS resolution failed");
    }
    if (candidates.length === 0) {
      throw new Error("SSRF_DENIED: DNS resolution failed");
    }
  }
  const publicOnes = candidates.filter(isPublicAddress);
  if (publicOnes.length !== candidates.length) {
    throw new Error("SSRF_DENIED: resolved address is not public");
  }
  return { url, pinnedIps: candidates };
}
