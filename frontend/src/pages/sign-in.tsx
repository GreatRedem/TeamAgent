import { Brand } from '@/components/brand';
import { WalletSignIn } from '@/components/wallet-sign-in';
import { Stack } from '@/ui/stack';
import { Text } from '@/ui/text';

export function SignIn() {
    return (
        <section className="mx-auto w-full max-w-sm">
            <Stack
                direction="Vertical"
                className="rounded-xl border bg-card/90 p-8 shadow-lift backdrop-blur-xl">
                <Brand size="lg" />

                <Text type="Title" className="mt-6 mb-2" message="Nura Team AI" />

                <Text
                    type="ForegroundMuted"
                    className="mt-0 mb-7"
                    message="Sign in with a wallet signature. There is no password to lose."
                />

                <WalletSignIn />
            </Stack>
        </section>
    );
}
