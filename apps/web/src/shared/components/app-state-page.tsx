import type { ReactNode } from "react";
import { Link } from "react-router";
import { ApiError } from "@/shared/api/api-error";
import { ApiNetworkError } from "@/shared/api/api-network-error";
import { BrandLockup } from "@/shared/brand/brand-lockup";
import { Button } from "@/shared/components/ui/button";
import { cn } from "@/shared/lib/cn";
import styles from "./app-state-page.module.css";

type AppStatePageProps = {
  title: string;
  description: string;
  primaryAction: ReactNode;
  secondaryAction?: ReactNode;
  referenceId?: string;
  compact?: boolean;
  showBrand?: boolean;
};

export function AppStatePage({
  title,
  description,
  primaryAction,
  secondaryAction,
  referenceId,
  compact = false,
  showBrand = !compact,
}: AppStatePageProps) {
  const content = (
    <section
      className={cn(styles.card, compact && styles.compact)}
      role="alert"
      aria-live="assertive"
    >
      {compact ? (
        <h2 className={styles.title}>{title}</h2>
      ) : (
        <h1 className={styles.title}>{title}</h1>
      )}
      <p className={styles.description}>{description}</p>
      <div className={styles.actions}>
        {primaryAction}
        {secondaryAction}
      </div>
      {referenceId ? (
        <p className={styles.reference}>Reference: {referenceId}</p>
      ) : null}
    </section>
  );

  if (compact) return content;

  return (
    <main className={styles.page}>
      <div className={styles.panel}>
        {showBrand ? <BrandLockup className={styles.brand} /> : null}
        {content}
      </div>
    </main>
  );
}

export function StateLink({
  to,
  children,
}: {
  to: string;
  children: ReactNode;
}) {
  return (
    <Link className={styles.link} to={to}>
      {children}
    </Link>
  );
}

export function queryErrorDescription(error: unknown) {
  if (error instanceof ApiNetworkError) {
    return "We couldn't connect to Schedlane. Check your connection and try again.";
  }
  if (error instanceof ApiError && error.status === 429) {
    return "Too many requests. Please wait a moment and try again.";
  }
  return "We couldn't load this page. Try again.";
}

export function QueryErrorState({
  error,
  onRetry,
  title = "Something went wrong",
  compact = true,
}: {
  error: unknown;
  onRetry: () => void;
  title?: string;
  compact?: boolean;
}) {
  return (
    <AppStatePage
      compact={compact}
      title={title}
      description={queryErrorDescription(error)}
      primaryAction={<Button onClick={onRetry}>Try again</Button>}
      referenceId={error instanceof ApiError ? error.requestId : undefined}
    />
  );
}

export function NotFoundPage({
  compact = false,
  destination = "/",
  actionLabel = "Go to Schedlane",
}: {
  compact?: boolean;
  destination?: string;
  actionLabel?: string;
}) {
  return (
    <AppStatePage
      compact={compact}
      title="Page not found"
      description="The page you're looking for doesn't exist or may have moved."
      primaryAction={<StateLink to={destination}>{actionLabel}</StateLink>}
    />
  );
}
