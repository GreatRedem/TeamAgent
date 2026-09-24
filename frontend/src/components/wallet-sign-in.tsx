import { Check, LoaderCircle, Wallet } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';

import { ApiError, walletNonce, walletSignIn } from '@/apis';
import { WALLETS } from '@/libs/constant';
import { apiError, t } from '@/libs/i18n';
import { writeAccessToken } from '@/libs/session';
import { type DiscoveredWallet, discoverWallets, matchWallet } from '@/libs/wallet';
import { Alert, AlertDescription } from '@/ui/alert';
import { Button } from '@/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/ui/dialog';
import { Image } from '@/ui/image';
import { Pressable } from '@/ui/pressable';
import { Stack } from '@/ui/stack';
import { Text } from '@/ui/text';

type Status =
    | { kind: 'idle' }
    | { kind: 'busy'; wallet: string; step: string }
    | { kind: 'error'; message: string };

export function WalletSignIn() {
    const navigate = useNavigate();

    const [open, setOpen] = useState(false);
    const [found, setFound] = useState<DiscoveredWallet[] | null>(null);
    const [status, setStatus] = useState<Status>({ kind: 'idle' });

    useEffect(() => {
        if (!open || found !== null) {
            return;
        }

        let active = true;

        void discoverWallets().then((wallets) => {
            if (active) {
                setFound(wallets);
            }
        });

        return () => {
            active = false;
        };
    }, [open, found]);

    const signIn = useCallback(
        async (name: string, provider: EthereumProvider) => {
            try {
                setStatus({ kind: 'busy', wallet: name, step: t('auth.step.opening', { name }) });

                const accounts = await provider.request({ method: 'eth_requestAccounts' });
                const address =
                    Array.isArray(accounts) && typeof accounts[0] === 'string'
                        ? accounts[0]
                        : undefined;

                if (!address) {
                    setStatus({
                        kind: 'error',
                        message: t('auth.errors.noAccount', { name }),
                    });

                    return;
                }

                setStatus({ kind: 'busy', wallet: name, step: t('auth.step.challenge') });

                const { message } = await walletNonce(address);

                setStatus({ kind: 'busy', wallet: name, step: t('auth.step.signature') });

                const signed = await provider.request({
                    method: 'personal_sign',
                    params: [message, address],
                });

                if (typeof signed !== 'string') {
                    setStatus({
                        kind: 'error',
                        message: t('auth.errors.unreadableSignature', { name }),
                    });

                    return;
                }

                setStatus({ kind: 'busy', wallet: name, step: t('auth.step.checking') });

                const { accessToken } = await walletSignIn(address, signed);

                writeAccessToken(accessToken);

                await navigate('/dashboard', { replace: true });
            } catch (error) {
                const message =
                    error instanceof ApiError
                        ? apiError(error, 'auth.errors.signInFailed')
                        : error instanceof Error
                          ? error.message
                          : t('auth.errors.signInFailed');

                setStatus({ kind: 'error', message });
            }
        },
        [navigate],
    );

    const busy = status.kind === 'busy';

    return (
        <>
            <Button
                className="w-full"
                size="lg"
                onClick={() => {
                    setStatus({ kind: 'idle' });
                    setOpen(true);
                }}
                icon={<Wallet />}
                message={t('auth.signIn')}
            />

            <Dialog
                open={open}
                onOpenChange={(next) => {
                    if (!busy) {
                        setOpen(next);
                    }
                }}>
                <DialogContent size="sm">
                    <DialogHeader>
                        <DialogTitle>{t('auth.dialog.title')}</DialogTitle>
                        <DialogDescription>{t('auth.dialog.description')}</DialogDescription>
                    </DialogHeader>

                    <Stack direction="Vertical" as="ul" className="m-0 list-none gap-2 p-0">
                        {WALLETS.map((wallet) => {
                            const installed =
                                found === null
                                    ? undefined
                                    : matchWallet(found, wallet.rdns, wallet.keyword);

                            const fallback =
                                wallet.id === 'metamask' && found?.length === 0
                                    ? window.ethereum
                                    : undefined;

                            const provider = installed?.provider ?? fallback;
                            const running = busy && status.wallet === wallet.name;

                            return (
                                <Stack direction="Vertical" as="li" key={wallet.id}>
                                    <Pressable
                                        disabled={busy || found === null || provider === undefined}
                                        className="flex w-full items-center gap-3 rounded-lg border bg-card px-4 py-3 text-start transition-colors hover:border-input hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60"
                                        onClick={() => {
                                            if (provider !== undefined) {
                                                void signIn(wallet.name, provider);
                                            }
                                        }}>
                                        <Stack
                                            direction="Vertical"
                                            as="span"
                                            className="size-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                                            {installed?.icon === undefined ? (
                                                <Wallet
                                                    size={16}
                                                    className="text-muted-foreground"
                                                />
                                            ) : (
                                                <Image
                                                    src={installed.icon}
                                                    alt=""
                                                    className="size-9"
                                                />
                                            )}
                                        </Stack>

                                        <Stack
                                            direction="Vertical"
                                            as="span"
                                            className="min-w-0 gap-0.5">
                                            <Text
                                                type="Strong"
                                                as="span"
                                                className="truncate"
                                                message={wallet.name}
                                            />
                                            <Text
                                                type="Caption"
                                                as="span"
                                                className="truncate"
                                                message={
                                                    running
                                                        ? status.step
                                                        : found === null
                                                          ? t('auth.dialog.looking')
                                                          : provider === undefined
                                                            ? t('auth.dialog.notInstalled')
                                                            : t(wallet.blurb)
                                                }
                                            />
                                        </Stack>

                                        <Stack
                                            direction="Horizontal"
                                            as="span"
                                            className="ml-auto shrink-0">
                                            {running ? (
                                                <LoaderCircle
                                                    size={16}
                                                    className="animate-spin text-primary"
                                                />
                                            ) : provider === undefined ? null : (
                                                <Check size={16} className="text-primary" />
                                            )}
                                        </Stack>
                                    </Pressable>
                                </Stack>
                            );
                        })}
                    </Stack>

                    {found?.length === 0 && (
                        <Text type="Caption" message={t('auth.dialog.noneFound')} />
                    )}

                    {status.kind === 'error' && (
                        <Alert variant="destructive">
                            <AlertDescription>{status.message}</AlertDescription>
                        </Alert>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}
