import { Navigate, Outlet } from "react-router";
import { ApiError } from "@/shared/api/api-error";
import { BrandLockup } from "@/shared/brand/brand-lockup";
import { QueryErrorState } from "@/shared/components/app-state-page";
import { usePlatformIdentity } from "./hooks/use-platform";
import styles from "./platform.module.css";

export function PlatformAccessGate() {
  const identity = usePlatformIdentity();
  if (identity.isPending) {
    return (
      <main className={styles.gate}>
        <BrandLockup />
        <p>Checking platform access…</p>
      </main>
    );
  }
  if (identity.error instanceof ApiError && identity.error.status === 403) {
    return <Navigate replace to="/app" />;
  }
  if (identity.isError) {
    return (
      <main className={styles.gate}>
        <QueryErrorState
          error={identity.error}
          onRetry={() => void identity.refetch()}
          title="We couldn't open Platform Admin"
        />
      </main>
    );
  }
  return <Outlet context={identity.data} />;
}
