import { type FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { queryClient } from "@/app/providers/query-client";
import { authClient } from "@/shared/auth/auth-client";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
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
        <p
          className="mb-5 rounded-md border border-[#b7dfd8] bg-primary-subtle px-3 py-2.5 text-sm text-primary"
          role="status"
        >
          Your email is verified. You can sign in now.
        </p>
      ) : null}

      {verificationError ? (
        <p
          className="mb-5 rounded-md border border-[#f0c8c4] bg-[#fff7f6] px-3 py-2.5 text-sm text-destructive"
          role="alert"
        >
          {verificationErrors[verificationError] ??
            "We couldn't verify that email link. Request a new one below."}
        </p>
      ) : null}

      {error ? (
        <p
          className="mb-5 rounded-md border border-[#f0c8c4] bg-[#fff7f6] px-3 py-2.5 text-sm text-destructive"
          id="sign-in-error"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {unverified ? (
        <div
          className="mb-5 rounded-md border border-[#ead9aa] bg-[#fffaf0] px-3 py-2.5 text-sm text-[#725b18]"
          role="alert"
        >
          <p>Verify your email before signing in.</p>
          <Link
            className="mt-1 inline-block font-medium text-primary underline-offset-4 hover:underline"
            state={{ email }}
            to="/verify-email"
          >
            Resend verification email
          </Link>
        </div>
      ) : null}

      <form className="space-y-5" onSubmit={handleSubmit}>
        <div>
          <label className="mb-1.5 block text-sm font-medium" htmlFor="email">
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
        <div>
          <label
            className="mb-1.5 block text-sm font-medium"
            htmlFor="password"
          >
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
        <Button className="w-full" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        New to Schedlane?{" "}
        <Link
          className="font-medium text-primary underline-offset-4 hover:underline"
          to="/sign-up"
        >
          Create an account
        </Link>
      </p>
    </AuthLayout>
  );
}
