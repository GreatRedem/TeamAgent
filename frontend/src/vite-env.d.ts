/// <reference types="vite/client" />

/** Minimal EIP-1193 surface, so no wallet SDK is needed for sign-in. */
interface EthereumProvider
{
    request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

interface Window
{
    ethereum?: EthereumProvider;
}
