import { Brand } from '@/components/ui/brand';
import { WalletSignIn } from '@/components/wallet-sign-in';

export function SignIn() {
    return (
        <section className="mx-auto w-full max-w-sm">
            <div className="rounded-xl border bg-card/90 p-8 shadow-lift backdrop-blur-xl">
                <Brand />

                <h1 className="mt-6 mb-2 text-page font-semibold tracking-tight">
                    Run your agents
                </h1>

                <p className="mt-0 mb-7 text-muted-foreground">
                    Nura signs you in with a wallet signature. There is no password to lose.
                </p>

                <WalletSignIn />
            </div>
        </section>
    );
}
