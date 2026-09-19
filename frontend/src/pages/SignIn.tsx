import { WalletSignIn } from '../components/WalletSignIn';

export function SignIn()
{
    return (
        <>
            <p className="subtitle">
                Wallet is the only way in. No password, no email.
            </p>

            <WalletSignIn />
        </>
    );
}
