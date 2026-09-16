import { createPublicClient, hashMessage, http, verifyMessage, type Hex } from "viem";

export interface ContractSignatureVerifier {
  (input: { address: string; message: string; signature: Hex; rpcUrl: string }): Promise<boolean>;
}

export interface SignatureCheck {
  address: string;
  message: string;
  signature: Hex;
  rpcUrl: string;
  rpcTimeoutMs?: number;
  /** Injected in tests; production uses EIP-1271 over the configured RPC. */
  contractVerifier?: ContractSignatureVerifier;
}

/** EIP-1271 magic value: isValidSignature MUST return exactly this. */
export const ERC1271_MAGIC = "0x1626ba7e";

async function defaultContractVerifier(input: {
  address: string;
  message: string;
  signature: Hex;
  rpcUrl: string;
}): Promise<boolean> {
  const client = createPublicClient({ transport: http(input.rpcUrl) });
  try {
    return await client.verifyHash({
      address: input.address as Hex,
      hash: hashMessage(input.message),
      signature: input.signature,
    });
  } catch {
    // Fail closed: an RPC error is never a successful verification (W4).
    return false;
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("rpc timeout")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * EOA first via message recovery; smart-contract wallets via EIP-1271 with
 * a timeout. Every failure mode — wrong signer, non-magic return, RPC
 * error, timeout — resolves to false (W4 fails closed).
 */
export async function verifyWalletSignature(check: SignatureCheck): Promise<boolean> {
  let eoa = false;
  try {
    eoa = await verifyMessage({
      address: check.address as Hex,
      message: check.message,
      signature: check.signature,
    });
  } catch {
    eoa = false;
  }
  if (eoa) return true;

  const verifier = check.contractVerifier ?? defaultContractVerifier;
  try {
    return await withTimeout(
      verifier({
        address: check.address,
        message: check.message,
        signature: check.signature,
        rpcUrl: check.rpcUrl,
      }),
      check.rpcTimeoutMs ?? 5000,
    );
  } catch {
    return false;
  }
}
