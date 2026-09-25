import { Building2, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { Link, Navigate, Outlet, useLocation, useParams } from "react-router";
import { BrandLockup } from "@/shared/brand/brand-lockup";
import { Button } from "@/shared/components/ui/button";
import { useOrganizations } from "../hooks/use-organizations";
import type { Organization } from "../types";

const staffSections = new Set(["bookings", "team"]);

export type OrganizationAccessContext = {
  currentOrganization: Organization;
  organizations: Organization[];
};

function ApplicationFrame({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-dvh bg-background px-5 py-8 sm:px-8">
      <BrandLockup />
      <div className="mx-auto flex min-h-[calc(100dvh-96px)] max-w-xl items-center justify-center py-10">
        {children}
      </div>
    </main>
  );
}

function LoadingOrganizations() {
  return (
    <ApplicationFrame>
      <div aria-busy="true" className="text-center" role="status">
        <span className="mx-auto block size-5 animate-spin rounded-full border-2 border-border-strong border-t-primary" />
        <p className="mt-4 text-sm text-muted-foreground">
          Loading your organizations…
        </p>
      </div>
    </ApplicationFrame>
  );
}

function OrganizationsError({ retry }: { retry: () => void }) {
  return (
    <ApplicationFrame>
      <section className="w-full rounded-xl border border-border bg-surface p-7 text-center">
        <h1 className="text-xl font-semibold">
          We couldn't load your organizations
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Check your connection and try again.
        </p>
        <Button className="mt-5" onClick={retry} variant="outline">
          <RefreshCw aria-hidden="true" className="size-4" />
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
        <section className="w-full rounded-xl border border-border bg-surface p-7 text-center">
          <span className="mx-auto flex size-11 items-center justify-center rounded-full bg-primary-subtle text-primary">
            <Building2 aria-hidden="true" className="size-5" />
          </span>
          <h1 className="mt-5 text-xl font-semibold">
            No organization access yet
          </h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Ask an organization owner to invite you, or create an organization
            when onboarding becomes available.
          </p>
          {import.meta.env.DEV ? (
            <p className="mt-5 rounded-md border border-border bg-background px-3 py-2 text-xs leading-5 text-muted-foreground">
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
      <section className="w-full">
        <h1 className="text-2xl font-semibold tracking-[-0.02em]">
          Choose an organization
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Select the workspace you want to manage.
        </p>
        <div className="mt-6 space-y-2">
          {organizations.map((organization) => (
            <Link
              className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3.5 transition-colors duration-150 hover:border-border-strong hover:bg-primary-subtle"
              key={organization.id}
              to={`/app/${organization.id}/bookings`}
            >
              <span className="font-medium text-foreground">
                {organization.name}
              </span>
              <span className="text-xs text-muted-foreground">
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
