import { LogOut, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { Link, Navigate, Outlet, useLocation, useParams } from "react-router";
import { useSignOut } from "@/features/auth/hooks/use-sign-out";
import { usePlatformIdentity } from "@/features/platform/hooks/use-platform";
import { ApiError } from "@/shared/api/api-error";
import { authClient } from "@/shared/auth/auth-client";
import { BrandLockup } from "@/shared/brand/brand-lockup";
import { Button } from "@/shared/components/ui/button";
import { useOrganizations } from "../hooks/use-organizations";
import { shouldEnterPlatform } from "../lib/entry-route";
import { OrganizationOnboarding } from "../onboarding/organization-onboarding";
import type { Organization } from "../types";
import styles from "./organization-route-states.module.css";

const staffSections = new Set(["bookings", "team"]);

export type OrganizationAccessContext = {
  currentOrganization: Organization;
  organizations: Organization[];
};

function ApplicationFrame({ children }: { children: ReactNode }) {
  const { data: session } = authClient.useSession();
  const signOut = useSignOut();
  return (
    <main className={styles.frame}>
      <header className={styles.frameHeader}>
        <BrandLockup />
        {session ? (
          <div className={styles.accountControl}>
            <span>{session.user.email}</span>
            <Button
              disabled={signOut.isPending}
              onClick={() => void signOut.signOut()}
              size="sm"
              variant="ghost"
            >
              <LogOut aria-hidden="true" className={styles.icon} /> Sign out
            </Button>
          </div>
        ) : null}
      </header>
      {signOut.error ? (
        <p className={styles.signOutError} role="alert">
          Sign out failed. Try again.
        </p>
      ) : null}
      <div className={styles.content}>{children}</div>
    </main>
  );
}

export function OrganizationRequestRoute() {
  return (
    <ApplicationFrame>
      <OrganizationOnboarding />
    </ApplicationFrame>
  );
}

function LoadingOrganizations() {
  return (
    <ApplicationFrame>
      <div aria-busy="true" className={styles.loading} role="status">
        <span className={styles.spinner} />
        <p className={styles.loadingText}>Loading your organizations…</p>
      </div>
    </ApplicationFrame>
  );
}

function OrganizationsError({ retry }: { retry: () => void }) {
  return (
    <ApplicationFrame>
      <section className={styles.messageCard}>
        <h1 className={styles.messageTitle}>
          We couldn't load your organizations
        </h1>
        <p className={styles.messageDescription}>
          Check your connection and try again.
        </p>
        <Button
          className={styles.messageAction}
          onClick={retry}
          variant="outline"
        >
          <RefreshCw aria-hidden="true" className={styles.icon} />
          Try again
        </Button>
      </section>
    </ApplicationFrame>
  );
}

function roleLabel(role: Organization["role"]) {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function OrganizationResolver() {
  const organizationsQuery = useOrganizations();
  const platformIdentity = usePlatformIdentity();

  if (organizationsQuery.isPending) return <LoadingOrganizations />;
  if (organizationsQuery.isError) {
    return (
      <OrganizationsError retry={() => void organizationsQuery.refetch()} />
    );
  }

  const organizations = organizationsQuery.data.items;

  if (organizations.length === 0) {
    if (platformIdentity.isPending) return <LoadingOrganizations />;
    if (shouldEnterPlatform(organizations.length, platformIdentity.isSuccess)) {
      return <Navigate replace to="/platform/requests" />;
    }
    if (
      platformIdentity.error instanceof ApiError &&
      platformIdentity.error.status !== 403
    ) {
      return (
        <OrganizationsError retry={() => void platformIdentity.refetch()} />
      );
    }
    return (
      <ApplicationFrame>
        <OrganizationOnboarding />
      </ApplicationFrame>
    );
  }

  if (organizations.length === 1) {
    return <Navigate replace to={`/app/${organizations[0].id}/bookings`} />;
  }

  return (
    <ApplicationFrame>
      <section className={styles.organizationPicker}>
        <h1 className={styles.pickerTitle}>Choose an organization</h1>
        <p className={styles.pickerDescription}>
          Select the workspace you want to manage.
        </p>
        <div className={styles.organizationList}>
          {organizations.map((organization) => (
            <Link
              className={styles.organizationLink}
              key={organization.id}
              to={`/app/${organization.id}/bookings`}
            >
              <span className={styles.organizationName}>
                {organization.name}
              </span>
              <span className={styles.organizationRole}>
                {roleLabel(organization.role)}
              </span>
            </Link>
          ))}
        </div>
        <Link
          className={styles.requestOrganizationLink}
          to="/app/request-organization"
        >
          Request another organization
        </Link>
      </section>
    </ApplicationFrame>
  );
}

export function OrganizationAccessGate() {
  const organizationsQuery = useOrganizations();
  const location = useLocation();
  const { organizationId } = useParams<{ organizationId: string }>();

  if (organizationsQuery.isPending) return <LoadingOrganizations />;
  if (organizationsQuery.isError) {
    return (
      <OrganizationsError retry={() => void organizationsQuery.refetch()} />
    );
  }

  const currentOrganization = organizationsQuery.data.items.find(
    (organization) => organization.id === organizationId,
  );

  if (!currentOrganization) return <Navigate replace to="/app" />;

  const section = location.pathname.split("/").filter(Boolean)[2];
  if (
    currentOrganization.role === "staff" &&
    section &&
    !staffSections.has(section)
  ) {
    return <Navigate replace to={`/app/${currentOrganization.id}/bookings`} />;
  }

  return (
    <Outlet
      context={
        {
          currentOrganization,
          organizations: organizationsQuery.data.items,
        } satisfies OrganizationAccessContext
      }
    />
  );
}
