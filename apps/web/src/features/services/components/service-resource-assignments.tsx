import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useResources } from "@/features/resources/hooks/use-resources";
import { ApiError } from "@/shared/api/api-error";
import { Button } from "@/shared/components/ui/button";
import { InlineAlert } from "@/shared/components/ui/inline-alert";
import { cn } from "@/shared/lib/cn";
import {
  useAssignResourceToService,
  useServiceResources,
  useUnassignResourceFromService,
} from "../hooks/use-services";

type ServiceResourceAssignmentsProps = {
  organizationId: string;
  serviceId: string;
  isServiceActive: boolean;
  isReadOnly: boolean;
};

export function ServiceResourceAssignments({
  organizationId,
  serviceId,
  isServiceActive,
  isReadOnly,
}: ServiceResourceAssignmentsProps) {
  const [selectedResourceId, setSelectedResourceId] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const assignedQuery = useServiceResources(organizationId, serviceId);
  const allResourcesQuery = useResources(organizationId);

  const assignMutation = useAssignResourceToService(organizationId, serviceId);
  const unassignMutation = useUnassignResourceFromService(
    organizationId,
    serviceId,
  );

  const assignedResources = assignedQuery.data?.items ?? [];
  const allResources = allResourcesQuery.data?.items ?? [];

  const assignedIds = new Set(assignedResources.map((r) => r.id));
  const unassignedResources = allResources.filter(
    (r) => !assignedIds.has(r.id),
  );

  async function handleAssign(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedResourceId || isReadOnly || assignMutation.isPending) return;

    setActionError(null);
    try {
      await assignMutation.mutateAsync(selectedResourceId);
      setSelectedResourceId("");
    } catch (err) {
      if (err instanceof ApiError) {
        switch (err.code) {
          case "SERVICE_INACTIVE":
            setActionError(
              "Cannot assign resources while this service is inactive. Reactivate it first.",
            );
            return;
          case "RESOURCE_INACTIVE":
          case "RESOURCE_DEACTIVATED":
            setActionError(
              "The selected resource is deactivated and cannot be assigned.",
            );
            return;
          case "SERVICE_MANAGEMENT_NOT_ALLOWED":
            setActionError(
              "Your role does not allow modifying service assignments.",
            );
            return;
          case "ORGANIZATION_ARCHIVED":
            setActionError(
              "This organization is archived and cannot be modified.",
            );
            return;
          case "ORGANIZATION_SUSPENDED":
            setActionError(
              "This organization is suspended and cannot be modified.",
            );
            return;
          default:
            setActionError(err.message || "Failed to assign resource.");
            return;
        }
      }
      setActionError("Failed to assign resource. Please try again.");
    }
  }

  async function handleUnassign(resourceId: string) {
    if (isReadOnly || unassignMutation.isPending) return;

    setActionError(null);
    try {
      await unassignMutation.mutateAsync(resourceId);
    } catch (err) {
      if (err instanceof ApiError) {
        switch (err.code) {
          case "SERVICE_MANAGEMENT_NOT_ALLOWED":
            setActionError(
              "Your role does not allow modifying service assignments.",
            );
            return;
          default:
            setActionError(err.message || "Failed to unassign resource.");
            return;
        }
      }
      setActionError("Failed to unassign resource. Please try again.");
    }
  }

  return (
    <section aria-labelledby="service-resources-heading" className="space-y-4">
      <div>
        <h3
          id="service-resources-heading"
          className="text-sm font-semibold text-foreground"
        >
          Assigned resources
        </h3>
        <p className="mt-1 text-xs text-muted-foreground leading-normal">
          Bookable resources (people, chairs, rooms) that can deliver this
          service.
        </p>
      </div>

      {actionError ? (
        <InlineAlert variant="error" className="p-3 text-xs">
          {actionError}
        </InlineAlert>
      ) : null}

      {assignedQuery.isPending ? (
        <div aria-busy="true" className="space-y-2 py-2" role="status">
          <div className="h-4 w-32 rounded bg-border animate-pulse" />
          <div className="h-8 w-full rounded bg-border/60 animate-pulse" />
        </div>
      ) : assignedQuery.isError ? (
        <p className="text-xs text-destructive">
          Could not load assigned resources.
        </p>
      ) : (
        <div className="space-y-3">
          {assignedResources.length === 0 ? (
            <p className="text-xs text-muted-foreground rounded-lg border border-border bg-background p-3">
              No resources assigned to this service yet.
            </p>
          ) : (
            <ul
              aria-label="Assigned resources list"
              className="divide-y divide-border border-y border-border"
            >
              {assignedResources.map((resource) => {
                const isResourceActive = resource.deactivatedAt === null;

                return (
                  <li
                    key={resource.id}
                    className="flex items-center justify-between gap-3 px-3.5 py-2.5"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={cn(
                          "size-2 shrink-0 rounded-full",
                          isResourceActive
                            ? "bg-primary"
                            : "bg-subtle-foreground",
                        )}
                        aria-hidden="true"
                      />
                      <span className="text-sm font-medium text-foreground [overflow-wrap:anywhere]">
                        {resource.name}
                      </span>
                      {!isResourceActive ? (
                        <span className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium bg-background text-muted-foreground">
                          Inactive
                        </span>
                      ) : null}
                    </div>

                    {!isReadOnly ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-9 text-muted-foreground hover:text-destructive"
                        onClick={() => handleUnassign(resource.id)}
                        disabled={unassignMutation.isPending}
                        aria-label={`Unassign ${resource.name}`}
                        title="Unassign resource"
                      >
                        <Trash2 aria-hidden="true" className="size-3.5" />
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}

          {!isReadOnly ? (
            <div className="pt-2">
              {!isServiceActive ? (
                <p className="text-xs text-subtle-foreground">
                  Reactivate this service to assign resources.
                </p>
              ) : allResourcesQuery.isPending ? (
                <div className="h-9 w-full rounded bg-border/40 animate-pulse" />
              ) : allResources.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No resources exist in this organization yet. Add resources in
                  the Resources tab.
                </p>
              ) : unassignedResources.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  All organization resources are assigned to this service.
                </p>
              ) : (
                <form onSubmit={handleAssign} className="flex flex-wrap gap-2">
                  <div className="min-w-0 flex-1">
                    <label htmlFor="assign-resource-select" className="sr-only">
                      Select resource to assign
                    </label>
                    <select
                      id="assign-resource-select"
                      className={cn(
                        "h-9 min-w-0 w-full px-2.5",
                        "rounded-md border border-border-strong bg-surface",
                        "text-xs text-foreground",
                        "transition-colors duration-150 outline-none",
                        "enabled:hover:border-muted-foreground",
                        "focus-visible:border-primary focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-focus",
                        "[@media(pointer:coarse)]:text-base",
                      )}
                      value={selectedResourceId}
                      onChange={(e) => setSelectedResourceId(e.target.value)}
                      disabled={assignMutation.isPending}
                    >
                      <option value="">Select resource to assign…</option>
                      {unassignedResources.map((r) => {
                        const isInactive = r.deactivatedAt !== null;
                        return (
                          <option key={r.id} value={r.id} disabled={isInactive}>
                            {r.name}{" "}
                            {isInactive ? "(Inactive - cannot assign)" : ""}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <Button
                    type="submit"
                    size="sm"
                    disabled={!selectedResourceId || assignMutation.isPending}
                  >
                    <Plus aria-hidden="true" className="size-3.5" />
                    {assignMutation.isPending ? "Assigning…" : "Assign"}
                  </Button>
                </form>
              )}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
