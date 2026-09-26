import { type FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { queryClient } from "@/app/providers/query-client";
import { authClient } from "@/shared/auth/auth-client";
import { Button } from "@/shared/components/ui/button";
import { InlineAlert } from "@/shared/components/ui/inline-alert";
import { Input } from "@/shared/components/ui/input";
import styles from "../auth.module.css";
import { AuthLayout } from "../components/auth-layout";
import { safeReturnTo } from "../routing/return-to";

const verificationErrors: Record<string, string> = {
  INVALID_TOKEN: "That verification link is invalid. Request a new one below.",
  TOKEN_EXPIRED: "That verification link has expired. Request a new one below.",
};

export function SignInPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const verificationError = searchParams.get("error");
  const wasVerified =
    searchParams.get("verified") === "1" && !verificationError;
  const rawReturnTo = searchParams.get("returnTo");
  const returnTo = rawReturnTo ? safeReturnTo(rawReturnTo) : null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setUnverified(false);
    setIsSubmitting(true);

    try {
      const result = await authClient.signIn.email({ email, password });

      if (result.error) {
        if (result.error.code === "EMAIL_NOT_VERIFIED") {
          setUnverified(true);
          return;
        }

        setError(result.error.message ?? "We couldn't sign you in. Try again.");
        return;
      }

      queryClient.clear();
      navigate(safeReturnTo(searchParams.get("returnTo")), { replace: true });
    } catch {
      setError("We couldn't sign you in. Check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout
      description="Use your email and password to continue to your workspace."
      title="Welcome back"
    >
      {wasVerified ? (
        <InlineAlert as="p" variant="success" className={styles.alert}>
          Your email is verified. You can sign in now.
        </InlineAlert>
      ) : null}

      {verificationError ? (
        <InlineAlert as="p" variant="error" className={styles.alert}>
          {verificationErrors[verificationError] ??
            "We couldn't verify that email link. Request a new one below."}
        </InlineAlert>
      ) : null}

      {error ? (
        <InlineAlert
          as="p"
          variant="error"
          className={styles.alert}
          id="sign-in-error"
        >
          {error}
        </InlineAlert>
      ) : null}

      {unverified ? (
        <InlineAlert variant="warning" className={styles.alert}>
          <p className={styles.alertText}>
            Verify your email before signing in.
          </p>
          <Link
            className={`${styles.link} ${styles.alertLink}`}
            state={{ email }}
            to={
              returnTo
                ? `/verify-email?returnTo=${encodeURIComponent(returnTo)}`
                : "/verify-email"
            }
          >
            Resend verification email
          </Link>
        </InlineAlert>
      ) : null}

      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="email">
            Email
          </label>
          <Input
            autoComplete="email"
            id="email"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="password">
            Password
          </label>
          <Input
            aria-describedby={error ? "sign-in-error" : undefined}
            autoComplete="current-password"
            id="password"
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </div>
        <Button
          className={styles.submit}
          loading={isSubmitting}
          disabled={isSubmitting}
          type="submit"
        >
          Sign in
        </Button>
      </form>

      <p className={styles.footer}>
        New to Schedlane?{" "}
        <Link
          className={styles.link}
          to={
            returnTo
              ? `/sign-up?returnTo=${encodeURIComponent(returnTo)}`
              : "/sign-up"
          }
        >
          Create an account
        </Link>
      </p>
    </AuthLayout>
  );
}
