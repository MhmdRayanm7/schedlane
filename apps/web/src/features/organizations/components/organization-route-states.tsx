import { Building2, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { Link, Navigate, Outlet, useLocation, useParams } from "react-router";
import { BrandLockup } from "@/shared/brand/brand-lockup";
import { Button } from "@/shared/components/ui/button";
import { useOrganizations } from "../hooks/use-organizations";
import type { Organization } from "../types";
import styles from "./organization-route-states.module.css";

const staffSections = new Set(["bookings", "team"]);

export type OrganizationAccessContext = {
  currentOrganization: Organization;
  organizations: Organization[];
};

function ApplicationFrame({ children }: { children: ReactNode }) {
  return (
    <main className={styles.frame}>
      <BrandLockup />
      <div className={styles.content}>{children}</div>
    </main>
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

  if (organizationsQuery.isPending) return <LoadingOrganizations />;
  if (organizationsQuery.isError) {
    return (
      <OrganizationsError retry={() => void organizationsQuery.refetch()} />
    );
  }

  const organizations = organizationsQuery.data.items;

  if (organizations.length === 0) {
    return (
      <ApplicationFrame>
        <section className={styles.messageCard}>
          <span className={styles.messageIcon}>
            <Building2 aria-hidden="true" className={styles.largeIcon} />
          </span>
          <h1 className={styles.emptyTitle}>No organization access yet</h1>
          <p className={styles.messageDescription}>
            Ask an organization owner to invite you, or create an organization
            when onboarding becomes available.
          </p>
          {import.meta.env.DEV ? (
            <p className={styles.developmentHint}>
              Development: link this verified account with{" "}
              <code>pnpm db:seed:demo-owner -- your@email.com</code>.
            </p>
          ) : null}
        </section>
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
