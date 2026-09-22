import { WalletSignIn } from '../components/WalletSignIn';

export function SignIn()
{
    return (
        <section className="mx-auto flex min-h-[60dvh] w-full max-w-lg flex-col items-center justify-center text-center">
            <h1 className="m-0 text-4xl font-bold tracking-tight sm:text-5xl">Welcome to Nura</h1>

            <p className="mt-3 mb-8 text-base text-ink-2">Connect your wallet to continue. No password, one signature.</p>

            <WalletSignIn />
        </section>
    );
}
