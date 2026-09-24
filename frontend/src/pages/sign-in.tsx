import { WalletSignIn } from '@/components/wallet-sign-in';
import { t } from '@/libs/i18n';
import { Brand } from '@/ui/brand';
import { Stack } from '@/ui/stack';
import { Text } from '@/ui/text';

export function SignIn() {
    return (
        <Stack direction="Vertical" as="section" className="mx-auto w-full max-w-sm">
            <Stack
                direction="Vertical"
                className="rounded-xl border bg-card/90 p-8 shadow-lift backdrop-blur-xl">
                <Brand size="lg" />

                <Text type="Title" className="mt-6 mb-2" message="Nura Team AI" />

                <Text type="ForegroundMuted" className="mt-0 mb-7" message={t('auth.intro')} />

                <WalletSignIn />
            </Stack>
        </Stack>
    );
}
