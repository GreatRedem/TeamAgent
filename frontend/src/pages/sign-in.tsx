import { MessageSquareText, Wallet } from 'lucide-react';
import { useState } from 'react';

import { PhoneSignIn } from '@/components/phone-sign-in';
import { WalletSignIn } from '@/components/wallet-sign-in';
import { t } from '@/libs/i18n';
import { Brand } from '@/ui/brand';
import { Stack } from '@/ui/stack';
import { Tabs } from '@/ui/tabs';
import { Text } from '@/ui/text';

export function SignIn() {
    const [method, setMethod] = useState<'wallet' | 'phone'>('wallet');

    return (
        <Stack direction="Vertical" as="section" className="mx-auto w-full max-w-sm">
            <Stack
                direction="Vertical"
                className="rounded-xl border bg-card/90 p-8 shadow-lift backdrop-blur-xl">
                <Brand size="lg" />

                <Text type="Title" className="mt-6 mb-2" message="Nura Team AI" />

                <Text type="ForegroundMuted" className="mt-0 mb-7" message={t('auth.intro')} />

                <Tabs
                    tabs={[
                        { value: 'wallet', label: t('auth.tab.wallet'), icon: Wallet },
                        { value: 'phone', label: t('auth.tab.phone'), icon: MessageSquareText },
                    ]}
                    value={method}
                    onValueChange={setMethod}
                    panels={{ wallet: <WalletSignIn />, phone: <PhoneSignIn /> }}
                />
            </Stack>
        </Stack>
    );
}
