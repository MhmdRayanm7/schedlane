import { type FormEvent, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router";
import { authClient } from "@/shared/auth/auth-client";
import { Button } from "@/shared/components/ui/button";
import { InlineAlert } from "@/shared/components/ui/inline-alert";
import { Input } from "@/shared/components/ui/input";
import styles from "../auth.module.css";
import { AuthLayout } from "../components/auth-layout";
import { safeReturnTo } from "../routing/return-to";

type VerifyEmailLocationState = {
  email?: string;
};

export function VerifyEmailPage() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const rawReturnTo = searchParams.get("returnTo");
  const returnTo = rawReturnTo ? safeReturnTo(rawReturnTo) : null;

  const state = location.state as VerifyEmailLocationState | null;
  const [email, setEmail] = useState(state?.email ?? "");
  const [error, setError] = useState<string | null>(null);
  const [wasSent, setWasSent] = useState(false);
  const [isSending, setIsSending] = useState(false);

  async function handleResend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setWasSent(false);
    setIsSending(true);

    try {
      const callbackUrl = new URL("/login?verified=1", window.location.origin);
      if (returnTo) {
        callbackUrl.searchParams.set("returnTo", returnTo);
      }

      const result = await authClient.sendVerificationEmail({
        callbackURL: callbackUrl.toString(),
        email: email.trim().toLowerCase(),
      });

      if (result.error) {
        setError(
          "We couldn't send the email. Check the address and try again.",
        );
        return;
      }

      setWasSent(true);
    } catch {
      setError(
        "We couldn't send the email. Check your connection and try again.",
      );
    } finally {
      setIsSending(false);
    }
  }

  return (
    <AuthLayout
      description="Open the verification link we sent to your email before signing in."
      title="Check your inbox"
    >
      {email ? (
        <p className={styles.recipient}>
          We sent a verification link to{" "}
          <span className={styles.recipientEmail}>{email}</span>.
        </p>
      ) : null}

      {import.meta.env.DEV ? (
        <p className={styles.developmentHint}>
          Development note: the API may print the verification email to its
          console.
        </p>
      ) : null}

      {wasSent ? (
        <InlineAlert as="p" variant="success" className={styles.alert}>
          If an account exists for that email, a new verification link is on its
          way.
        </InlineAlert>
      ) : null}

      {error ? (
        <InlineAlert
          as="p"
          variant="error"
          className={styles.alert}
          id="resend-error"
        >
          {error}
        </InlineAlert>
      ) : null}

      <form className={styles.compactForm} onSubmit={handleResend}>
        {!state?.email ? (
          <div className={styles.field}>
            <label className={styles.label} htmlFor="email">
              Email
            </label>
            <Input
              aria-describedby={error ? "resend-error" : undefined}
              autoComplete="email"
              id="email"
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </div>
        ) : null}
        <Button
          className={styles.submit}
          disabled={isSending || !email}
          type="submit"
        >
          {isSending ? "Sending…" : "Resend verification email"}
        </Button>
      </form>

      <p className={styles.footer}>
        <Link
          className={styles.link}
          to={
            returnTo
              ? `/login?returnTo=${encodeURIComponent(returnTo)}`
              : "/login"
          }
        >
          Back to sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
