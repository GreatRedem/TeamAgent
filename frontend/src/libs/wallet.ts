import { WALLET_DISCOVERY_TIMEOUT } from '@/libs/constant';

export interface DiscoveredWallet {
    uuid: string;
    name: string;
    icon: string;
    rdns: string;
    provider: EthereumProvider;
}

export function discoverWallets(): Promise<DiscoveredWallet[]> {
    return new Promise((resolve) => {
        const found = new Map<string, DiscoveredWallet>();

        const onAnnounce = (event: EIP6963AnnounceProviderEvent) => {
            const { info, provider } = event.detail;

            found.set(info.rdns, { ...info, provider });
        };

        window.addEventListener('eip6963:announceProvider', onAnnounce);
        window.dispatchEvent(new Event('eip6963:requestProvider'));

        window.setTimeout(() => {
            window.removeEventListener('eip6963:announceProvider', onAnnounce);

            resolve([...found.values()]);
        }, WALLET_DISCOVERY_TIMEOUT);
    });
}

export function matchWallet(wallets: DiscoveredWallet[], rdns: string, keyword: string) {
    return (
        wallets.find((wallet) => wallet.rdns === rdns) ??
        wallets.find((wallet) => wallet.rdns.toLowerCase().includes(keyword)) ??
        wallets.find((wallet) => wallet.name.toLowerCase().includes(keyword))
    );
}
