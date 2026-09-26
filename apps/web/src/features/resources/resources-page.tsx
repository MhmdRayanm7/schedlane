import { Plus, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useOutletContext, useParams } from "react-router";
import type { OrganizationAccessContext } from "@/features/organizations/components/organization-route-states";
import { PageHeader } from "@/shared/components/page-header";
import { Button } from "@/shared/components/ui/button";
import { ResourceCreateDialog } from "./components/resource-create-dialog";
import { ResourceDetailsSheet } from "./components/resource-details-sheet";
import { ResourceList } from "./components/resource-list";
import {
  useCreateResource,
  useDeactivateResource,
  useReactivateResource,
  useResources,
} from "./hooks/use-resources";
import type { CreateResourceInput } from "./types";

function ResourcesSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading resources"
      className="divide-y divide-border border-y border-border"
      role="status"
    >
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center justify-between p-4 sm:px-5">
          <div className="flex items-center gap-3.5">
            <div className="size-2 rounded-full bg-border-strong animate-pulse" />
            <div className="space-y-2">
              <div className="h-4 w-32 rounded bg-border-strong animate-pulse" />
              <div className="h-3 w-20 rounded bg-border animate-pulse" />
            </div>
          </div>
          <div className="h-4 w-4 rounded bg-border animate-pulse" />
        </div>
      ))}
    </div>
  );
}

function ResourcesErrorState({ retry }: { retry: () => void }) {
  return (
    <div className="border-y border-border py-6 text-center">
      <h2 className="text-base font-semibold text-foreground">
        Unable to load resources
      </h2>
      <p className="mt-1.5 text-sm text-muted-foreground">
        We encountered an error loading your organization's resources.
      </p>
      <Button variant="outline" size="sm" onClick={retry} className="mt-4">
        <RefreshCw aria-hidden="true" className="size-3.5" />
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
    <div className="border-y border-border py-8 text-center">
      <h2 className="text-base font-semibold text-foreground">
        No resources yet.
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Add a person, room, chair, or other bookable resource.
      </p>
      {!isReadOnly ? (
        <Button onClick={onNewResource} size="sm" className="mt-5">
          <Plus aria-hidden="true" className="size-4" />
          New resource
        </Button>
      ) : null}
    </div>
  );
}

export function ResourcesPage() {
  const { currentOrganization } = useOutletContext<OrganizationAccessContext>();
  const { organizationId = "" } = useParams<{ organizationId: string }>();

  const isReadOnly = Boolean(
    currentOrganization.archivedAt || currentOrganization.suspendedAt,
  );

  const resourcesQuery = useResources(organizationId);
  const createResourceMutation = useCreateResource(organizationId);
  const deactivateResourceMutation = useDeactivateResource(organizationId);
  const reactivateResourceMutation = useReactivateResource(organizationId);

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(
    null,
  );

  const resources = resourcesQuery.data?.items ?? [];
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

  return (
    <div className="relative space-y-6">
      <PageHeader
        title="Resources"
        description="Manage the people and resources that deliver your services."
        action={
          !isReadOnly ? (
            <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
              <Plus aria-hidden="true" className="size-4" />
              New resource
            </Button>
          ) : null
        }
      />

      <section aria-label="Resources list">
        {resourcesQuery.isPending ? <ResourcesSkeleton /> : null}

        {resourcesQuery.isError ? (
          <ResourcesErrorState retry={() => void resourcesQuery.refetch()} />
        ) : null}

        {resourcesQuery.data && resources.length === 0 ? (
          <ResourcesEmptyState
            isReadOnly={isReadOnly}
            onNewResource={() => setCreateDialogOpen(true)}
          />
        ) : null}

        {resourcesQuery.data && resources.length > 0 ? (
          <ResourceList
            resources={resources}
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
        isReadOnly={isReadOnly}
        isActionPending={
          deactivateResourceMutation.isPending ||
          reactivateResourceMutation.isPending
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
