import { type FormEvent, useState } from "react";
import { Link, useLocation } from "react-router";
import { authClient } from "@/shared/auth/auth-client";
import { Button } from "@/shared/components/ui/button";
import { InlineAlert } from "@/shared/components/ui/inline-alert";
import { Input } from "@/shared/components/ui/input";
import { AuthLayout } from "../components/auth-layout";

type VerifyEmailLocationState = {
  email?: string;
};

export function VerifyEmailPage() {
  const location = useLocation();
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
      const result = await authClient.sendVerificationEmail({
        callbackURL: new URL(
          "/login?verified=1",
          window.location.origin,
        ).toString(),
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
        <p className="mb-5 text-sm leading-6 text-muted-foreground">
          We sent a verification link to{" "}
          <span className="font-medium text-foreground">{email}</span>.
        </p>
      ) : null}

      {import.meta.env.DEV ? (
        <p className="mb-5 rounded-md border border-border bg-background px-3 py-2.5 text-xs leading-5 text-muted-foreground">
          Development note: the API may print the verification email to its
          console.
        </p>
      ) : null}

      {wasSent ? (
        <InlineAlert as="p" variant="success" className="mb-5">
          If an account exists for that email, a new verification link is on its
          way.
        </InlineAlert>
      ) : null}

      {error ? (
        <InlineAlert as="p" variant="error" className="mb-5" id="resend-error">
          {error}
        </InlineAlert>
      ) : null}

      <form className="space-y-4" onSubmit={handleResend}>
        {!state?.email ? (
          <div>
            <label className="mb-1.5 block text-sm font-medium" htmlFor="email">
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
        <Button className="w-full" disabled={isSending || !email} type="submit">
          {isSending ? "Sending…" : "Resend verification email"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm">
        <Link
          className="font-medium text-primary underline-offset-4 hover:underline"
          to="/login"
        >
          Back to sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
