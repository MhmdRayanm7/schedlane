import { Navigate, Outlet } from "react-router";
import { ApiError } from "@/shared/api/api-error";
import { BrandLockup } from "@/shared/brand/brand-lockup";
import { Button } from "@/shared/components/ui/button";
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
        <BrandLockup />
        <h1>We couldn't open Platform Admin</h1>
        <p>Check your connection and try again.</p>
        <Button onClick={() => void identity.refetch()} variant="outline">
          Try again
        </Button>
      </main>
    );
  }
  return <Outlet context={identity.data} />;
}
