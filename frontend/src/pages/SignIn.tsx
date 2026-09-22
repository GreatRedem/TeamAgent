import { WalletSignIn } from '../components/WalletSignIn';

export function SignIn()
{
    return (
        <section className="mx-auto w-full max-w-md">
            <div className="rounded-panel border border-edge bg-panel/90 p-8 text-center shadow-lift backdrop-blur-xl sm:p-10">
                <span className="mx-auto mb-6 inline-flex size-12 items-center justify-center rounded-panel bg-live text-live-ink">
                    <svg width="24" height="24" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M3.5 12.5V3.5l9 9v-9" />
                    </svg>
                </span>

                <h1 className="m-0 text-3xl font-bold tracking-tight sm:text-4xl">Welcome to Nura AI</h1>

                <p className="mt-3 mb-7 text-[15px] text-ink-2">Connect your wallet to continue. No password, one signature.</p>

                <WalletSignIn />
            </div>
        </section>
    );
}
