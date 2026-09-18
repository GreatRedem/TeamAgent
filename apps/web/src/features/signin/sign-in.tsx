import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useSession, type SignInError } from "../session/session.js";

/**
 * Sign-in (docs/25-ui-information.md): connect a wallet, sign a message.
 *
 * The screen's job is to prepare the user for what they will read in their
 * wallet, because the statement line in the EIP-4361 message is the only
 * thing standing between them and a signature request from a malicious site
 * (docs/20-authentication.md W2). So the full statement text is shown here
 * before the prompt, the domain is displayed prominently, and the
 * no-transaction guarantee is stated in the interface as well as the wallet.
 *
 * A lost wallet is a lost account; that is said on this screen, not buried in
 * a settings page nobody opens.
 */
export function SignInScreen(): ReactNode {
  const { t } = useTranslation();
  const { signIn, step, error, resetError } = useSession();

  const busy = step !== null;

  return (
    <main id="main" className="signin">
      <section className="signin-card" aria-labelledby="signin-title">
        <h1 id="signin-title">{t("signin.title")}</h1>

        <p className="signin-statement">{t("signin.statement")}</p>

        <p className="signin-domain">
          {/* The domain is the thing W2 hinges on; show exactly what the
              wallet will compare against, derived from the same source. */}
          {t("signin.readCarefully", { domain: window.location.host })}
        </p>

        {error !== null ? <SignInErrorNote error={error} onRetry={resetError} /> : null}

        <button
          type="button"
          className="button button-primary"
          disabled={busy}
          onClick={() => void signIn()}
        >
          {step === null
            ? t("signin.connect")
            : step === "connecting"
              ? t("signin.connecting")
              : step === "requesting-nonce"
                ? t("signin.requestNonce")
                : step === "awaiting-signature"
                  ? t("signin.checkWallet")
                  : t("signin.verifying")}
        </button>

        <p className="signin-note">{t("signin.lostWallet")}</p>
        <p className="signin-note">{t("signin.smartWalletNotice")}</p>
      </section>
    </main>
  );
}

function SignInErrorNote({
  error,
  onRetry,
}: {
  error: SignInError;
  onRetry: () => void;
}): ReactNode {
  const { t } = useTranslation();
  const key =
    error.kind === "no-provider"
      ? "signin.noProvider"
      : error.kind === "expired"
        ? "signin.expired"
        : error.kind === "domain"
          ? "signin.domainMismatch"
          : error.kind === "network"
            ? "errors.generic"
            : "signin.signatureFailed";
  return (
    <p className="signin-error" role="alert">
      {t(key)}{" "}
      <button type="button" className="button button-quiet" onClick={onRetry}>
        {t("signin.retry")}
      </button>
    </p>
  );
}
