/// <reference types="vite/client" />

interface EthereumProvider {
    request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

interface EIP6963ProviderInfo {
    uuid: string;
    name: string;
    icon: string;
    rdns: string;
}

interface EIP6963AnnounceProviderEvent extends CustomEvent {
    detail: { info: EIP6963ProviderInfo; provider: EthereumProvider };
}

interface WindowEventMap {
    'eip6963:announceProvider': EIP6963AnnounceProviderEvent;
}

interface Window {
    ethereum?: EthereumProvider;
}
