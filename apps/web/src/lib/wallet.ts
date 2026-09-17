/**
 * Minimal EIP-1193 surface. wagmi is the intended full integration
 * (docs/19-tech-stack.md); until it lands, the console speaks to the injected
 * provider through exactly these three methods, typed narrowly so nothing can
 * call an RPC method by accident.
 */
export interface Eip1193Provider {
  request(args: { method: "eth_requestAccounts" }): Promise<string[]>;
  request(args: { method: "personal_sign"; params: [string, string] }): Promise<string>;
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

export function getWalletProvider(): Eip1193Provider | null {
  return window.ethereum ?? null;
}

export async function connectWallet(): Promise<string> {
  const provider = getWalletProvider();
  if (provider === null) throw new Error("no-provider");
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  const address = accounts[0];
  if (address === undefined || address === "") throw new Error("no-accounts");
  return address;
}

/**
 * Build the EIP-4361 message (docs/20-authentication.md). The server
 * re-parses and validates every field with viem's parser, so this
 * construction must match it field for field:
 *
 * - domain: the browser origin host, which equals the deployed SIWE_DOMAIN
 *   under the documented nginx deployment (same origin serving both)
 * - statement: the security-control line, shown in the wallet before approval
 * - issuedAt: now; expirationTime: five minutes, like the nonce TTL
 *
 * The nonce arrives from the API and is bound server-side to this address.
 */
export interface SiweInput {
  domain: string;
  address: string;
  nonce: string;
  chainId: number;
  statement: string;
  issuedAt: Date;
  expirationTime: Date;
}

export function buildSiweMessage(input: SiweInput): string {
  const lines = [
    `${input.domain} wants you to sign in with your Ethereum account:`,
    input.address,
    "",
    input.statement,
    "",
    `URI: https://${input.domain}`,
    "Version: 1",
    `Chain ID: ${input.chainId}`,
    `Nonce: ${input.nonce}`,
    `Issued At: ${input.issuedAt.toISOString()}`,
    `Expiration Time: ${input.expirationTime.toISOString()}`,
  ];
  return lines.join("\n");
}

/**
 * Sign with personal_sign. The hex payload is EIP-191 personal-sign encoded
 * by the wallet itself; the API accepts the exact bytes it verifies.
 */
export async function signMessage(message: string, address: string): Promise<string> {
  const provider = getWalletProvider();
  if (provider === null) throw new Error("no-provider");
  return provider.request({
    method: "personal_sign",
    params: [
      hexEncodeMessage(message),
      // viem's isAddress check on the server normalizes case; pass through
      // exactly what eth_requestAccounts returned.
      address,
    ],
  });
}

function hexEncodeMessage(message: string): `0x${string}` {
  const bytes = new TextEncoder().encode(message);
  let hex = "0x";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex as `0x${string}`;
}
