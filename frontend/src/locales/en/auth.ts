const messages = {
    'auth.wallet.nura': 'Built for Nura, signs without leaving the app',
    'auth.wallet.metamask': 'The browser extension you may already have',
    'auth.intro': 'Sign in with a wallet signature. There is no password to lose.',
    'auth.signIn': 'Sign in with your wallet',
    'auth.dialog.title': 'Choose a wallet',
    'auth.dialog.description':
        'Nura signs you in with a signature. It never moves funds and never costs gas.',
    'auth.dialog.looking': 'Looking for it',
    'auth.dialog.notInstalled': 'Not installed in this browser',
    'auth.dialog.noneFound': 'No wallet announced itself. Install one, then reopen this dialog.',
    'auth.step.opening': 'Opening {name}',
    'auth.step.challenge': 'Asking for a challenge',
    'auth.step.signature': 'Waiting for your signature',
    'auth.step.checking': 'Checking the signature',
    'auth.errors.noAccount': '{name} did not share an account. Unlock it and try again.',
    'auth.errors.unreadableSignature': '{name} returned a signature Nura could not read.',
    'auth.errors.signInFailed': 'Sign-in did not finish.',
} as const;

export default messages;
