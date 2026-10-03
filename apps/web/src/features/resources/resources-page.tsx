import { Plus, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { useOutletContext, useParams } from "react-router";
import type { OrganizationAccessContext } from "@/features/organizations/components/organization-route-states";
import { PageHeader } from "@/shared/components/page-header";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { usePageTitle } from "@/shared/lib/page-title";
import { ResourceCreateDialog } from "./components/resource-create-dialog";
import { ResourceDetailsSheet } from "./components/resource-details-sheet";
import { ResourceList } from "./components/resource-list";
import {
  useCreateResource,
  useDeactivateResource,
  useDeleteResource,
  useReactivateResource,
  useResources,
} from "./hooks/use-resources";
import styles from "./resources.module.css";
import type { CreateResourceInput } from "./types";

function ResourcesSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading resources"
      className={styles.skeletonList}
      role="status"
    >
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className={styles.skeletonRow}>
          <div className={styles.skeletonSummary}>
            <div className={`${styles.skeleton} ${styles.skeletonDot}`} />
            <div className={styles.skeletonCopy}>
              <div className={`${styles.skeleton} ${styles.skeletonTitle}`} />
              <div className={`${styles.skeleton} ${styles.skeletonMeta}`} />
            </div>
          </div>
          <div className={`${styles.skeleton} ${styles.skeletonChevron}`} />
        </div>
      ))}
    </div>
  );
}

function ResourcesErrorState({ retry }: { retry: () => void }) {
  return (
    <div className={styles.state}>
      <h2 className={styles.stateTitle}>Unable to load resources</h2>
      <p className={styles.stateDescription}>
        We encountered an error loading your organization's resources.
      </p>
      <Button
        variant="outline"
        size="sm"
        onClick={retry}
        className={styles.stateAction}
      >
        <RefreshCw aria-hidden="true" className={styles.smallIcon} />
        Try again
      </Button>
    </div>
  );
}

function ResourcesEmptyState({
  isReadOnly,
  onNewResource,
}: {
  isReadOnly: boolean;
  onNewResource: () => void;
}) {
  return (
    <div className={`${styles.state} ${styles.emptyState}`}>
      <h2 className={styles.stateTitle}>No resources yet.</h2>
      <p className={styles.stateDescription}>
        Add a person, room, chair, or other bookable resource.
      </p>
      {!isReadOnly ? (
        <Button
          onClick={onNewResource}
          size="sm"
          className={styles.stateAction}
        >
          <Plus aria-hidden="true" className={styles.icon} />
          New resource
        </Button>
      ) : null}
    </div>
  );
}

export function ResourcesPage() {
  usePageTitle("Resources");
  const { currentOrganization } = useOutletContext<OrganizationAccessContext>();
  const { organizationId = "" } = useParams<{ organizationId: string }>();

  const isReadOnly = Boolean(
    currentOrganization.archivedAt || currentOrganization.suspendedAt,
  );

  const resourcesQuery = useResources(organizationId);
  const createResourceMutation = useCreateResource(organizationId);
  const deactivateResourceMutation = useDeactivateResource(organizationId);
  const reactivateResourceMutation = useReactivateResource(organizationId);
  const deleteResourceMutation = useDeleteResource(organizationId);
  const [lifecycle, setLifecycle] = useState<"active" | "inactive" | "all">(
    "active",
  );
  const [search, setSearch] = useState("");

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(
    null,
  );

  const resources = resourcesQuery.data?.items ?? [];
  const visibleResources = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return resources.filter((resource) => {
      const lifecycleMatches =
        lifecycle === "all" ||
        (lifecycle === "active"
          ? !resource.deactivatedAt
          : Boolean(resource.deactivatedAt));
      return (
        lifecycleMatches &&
        (!term || resource.name.toLocaleLowerCase().includes(term))
      );
    });
  }, [lifecycle, resources, search]);
  const selectedResource =
    resources.find((r) => r.id === selectedResourceId) ?? null;

  async function handleCreateResource(data: CreateResourceInput) {
    await createResourceMutation.mutateAsync(data);
  }

  async function handleDeactivate(resourceId: string) {
    await deactivateResourceMutation.mutateAsync(resourceId);
  }

  async function handleReactivate(resourceId: string) {
    await reactivateResourceMutation.mutateAsync(resourceId);
  }

  async function handleDelete(resourceId: string) {
    await deleteResourceMutation.mutateAsync(resourceId);
    setDetailsOpen(false);
    setSelectedResourceId(null);
  }

  return (
    <div className={styles.page}>
      <PageHeader
        title="Resources"
        description="Manage the people and resources that deliver your services."
        action={
          !isReadOnly ? (
            <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
              <Plus aria-hidden="true" className={styles.icon} />
              New resource
            </Button>
          ) : null
        }
      />

      <div className={styles.listFilters}>
        <label htmlFor="resource-lifecycle-filter">
          <span>Lifecycle</span>
          <select
            aria-label="Resource lifecycle"
            id="resource-lifecycle-filter"
            value={lifecycle}
            onChange={(event) =>
              setLifecycle(event.target.value as typeof lifecycle)
            }
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </select>
        </label>
        <label htmlFor="resource-search">
          <span>Search</span>
          <Input
            aria-label="Search resources"
            id="resource-search"
            type="search"
            placeholder="Resource name"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </div>

      <section aria-label="Resources list">
        {resourcesQuery.isPending ? <ResourcesSkeleton /> : null}

        {resourcesQuery.isError ? (
          <ResourcesErrorState retry={() => void resourcesQuery.refetch()} />
        ) : null}

        {resourcesQuery.data && visibleResources.length === 0 ? (
          resources.length > 0 ? (
            <div className={`${styles.state} ${styles.emptyState}`}>
              <h2 className={styles.stateTitle}>
                {search.trim()
                  ? "No resources match your search."
                  : lifecycle === "inactive"
                    ? "No inactive resources."
                    : "No active resources."}
              </h2>
            </div>
          ) : (
            <ResourcesEmptyState
              isReadOnly={isReadOnly}
              onNewResource={() => setCreateDialogOpen(true)}
            />
          )
        ) : null}

        {resourcesQuery.data && visibleResources.length > 0 ? (
          <ResourceList
            resources={visibleResources}
            onSelectResource={(resource) => {
              setSelectedResourceId(resource.id);
              setDetailsOpen(true);
            }}
          />
        ) : null}
      </section>

      <ResourceDetailsSheet
        key={selectedResourceId}
        resource={selectedResource}
        organizationId={organizationId}
        open={detailsOpen && Boolean(selectedResource)}
        onOpenChange={setDetailsOpen}
        onDeactivate={handleDeactivate}
        onReactivate={handleReactivate}
        onDelete={handleDelete}
        isReadOnly={isReadOnly}
        isActionPending={
          deactivateResourceMutation.isPending ||
          reactivateResourceMutation.isPending ||
          deleteResourceMutation.isPending
        }
      />

      <ResourceCreateDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSubmit={handleCreateResource}
        isPending={createResourceMutation.isPending}
        isReadOnly={isReadOnly}
      />
    </div>
  );
}
