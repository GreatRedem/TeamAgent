import { WalletSignIn } from '../components/WalletSignIn';

export function SignIn()
{
    return (
        <section className="hero">
            <h1 className="hero__title">Welcome to Nura</h1>

            <p className="hero__subtitle">Connect your wallet to continue</p>

            <WalletSignIn />
        </section>
    );
}
