import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router";
import { authClient } from "@/shared/auth/auth-client";
import { Button } from "@/shared/components/ui/button";
import { InlineAlert } from "@/shared/components/ui/inline-alert";
import { Input } from "@/shared/components/ui/input";
import styles from "../auth.module.css";
import { AuthLayout } from "../components/auth-layout";

type SignUpFields = {
  confirmPassword: string;
  email: string;
  name: string;
  password: string;
};

const initialFields: SignUpFields = {
  confirmPassword: "",
  email: "",
  name: "",
  password: "",
};

function validate(fields: SignUpFields): string | null {
  if (!fields.name.trim()) return "Enter your name.";
  if (!/^\S+@\S+\.\S+$/.test(fields.email))
    return "Enter a valid email address.";
  if (fields.password.length < 8)
    return "Use at least 8 characters for your password.";
  if (fields.password !== fields.confirmPassword)
    return "Your passwords don't match.";
  return null;
}

export function SignUpPage() {
  const navigate = useNavigate();
  const [fields, setFields] = useState(initialFields);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField(field: keyof SignUpFields, value: string) {
    setFields((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validate(fields);
    setError(validationError);
    if (validationError) return;

    setIsSubmitting(true);
    try {
      const email = fields.email.trim().toLowerCase();
      const result = await authClient.signUp.email({
        callbackURL: new URL(
          "/login?verified=1",
          window.location.origin,
        ).toString(),
        email,
        name: fields.name.trim(),
        password: fields.password,
      });

      if (result.error) {
        setError(
          result.error.message ?? "We couldn't create your account. Try again.",
        );
        return;
      }

      navigate("/verify-email", { replace: true, state: { email } });
    } catch {
      setError(
        "We couldn't create your account. Check your connection and try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthLayout
      description="Create your account to set up and manage your organization."
      title="Create your account"
    >
      {error ? (
        <InlineAlert
          as="p"
          variant="error"
          className={styles.alert}
          id="sign-up-error"
        >
          {error}
        </InlineAlert>
      ) : null}

      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="name">
            Name
          </label>
          <Input
            autoComplete="name"
            id="name"
            onChange={(event) => updateField("name", event.target.value)}
            required
            value={fields.name}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="email">
            Email
          </label>
          <Input
            autoComplete="email"
            id="email"
            onChange={(event) => updateField("email", event.target.value)}
            required
            type="email"
            value={fields.email}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="password">
            Password
          </label>
          <Input
            aria-describedby={error ? "sign-up-error" : undefined}
            autoComplete="new-password"
            id="password"
            minLength={8}
            onChange={(event) => updateField("password", event.target.value)}
            required
            type="password"
            value={fields.password}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="confirm-password">
            Confirm password
          </label>
          <Input
            autoComplete="new-password"
            id="confirm-password"
            minLength={8}
            onChange={(event) =>
              updateField("confirmPassword", event.target.value)
            }
            required
            type="password"
            value={fields.confirmPassword}
          />
        </div>
        <Button
          className={styles.submit}
          loading={isSubmitting}
          disabled={isSubmitting}
          type="submit"
        >
          Create account
        </Button>
      </form>

      <p className={styles.footer}>
        Already have an account?{" "}
        <Link className={styles.link} to="/login">
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
