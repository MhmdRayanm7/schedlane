import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useResources } from "@/features/resources/hooks/use-resources";
import { ApiError } from "@/shared/api/api-error";
import { Button } from "@/shared/components/ui/button";
import { InlineAlert } from "@/shared/components/ui/inline-alert";
import {
  useAssignResourceToService,
  useServiceResources,
  useUnassignResourceFromService,
} from "../hooks/use-services";
import styles from "../services.module.css";

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
    <section
      aria-labelledby="service-resources-heading"
      className={styles.assignments}
    >
      <div>
        <h3 id="service-resources-heading" className={styles.sectionTitle}>
          Assigned resources
        </h3>
        <p className={styles.sectionDescription}>
          Bookable resources (people, chairs, rooms) that can deliver this
          service.
        </p>
      </div>

      {actionError ? (
        <InlineAlert variant="error" className={styles.compactAlert}>
          {actionError}
        </InlineAlert>
      ) : null}

      {assignedQuery.isPending ? (
        <div aria-busy="true" className={styles.loading} role="status">
          <div className={`${styles.skeleton} ${styles.loadingTitle}`} />
          <div className={`${styles.skeleton} ${styles.loadingControl}`} />
        </div>
      ) : assignedQuery.isError ? (
        <p className={styles.error}>Could not load assigned resources.</p>
      ) : (
        <div className={styles.assignmentContent}>
          {assignedResources.length === 0 ? (
            <p className={styles.emptyAssignment}>
              No resources assigned to this service yet.
            </p>
          ) : (
            <ul
              aria-label="Assigned resources list"
              className={styles.assignmentList}
            >
              {assignedResources.map((resource) => {
                const isResourceActive = resource.deactivatedAt === null;

                return (
                  <li key={resource.id} className={styles.assignmentRow}>
                    <div className={styles.assignmentSummary}>
                      <span
                        className={styles.statusDot}
                        data-active={isResourceActive}
                        aria-hidden="true"
                      />
                      <span className={styles.assignmentName}>
                        {resource.name}
                      </span>
                      {!isResourceActive ? (
                        <span className={styles.inactiveBadge}>Inactive</span>
                      ) : null}
                    </div>

                    {!isReadOnly ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={styles.removeButton}
                        onClick={() => handleUnassign(resource.id)}
                        disabled={unassignMutation.isPending}
                        aria-label={`Unassign ${resource.name}`}
                        title="Unassign resource"
                      >
                        <Trash2
                          aria-hidden="true"
                          className={styles.smallIcon}
                        />
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}

          {!isReadOnly ? (
            <div className={styles.assignmentControls}>
              {!isServiceActive ? (
                <p className={`${styles.hint} ${styles.subtleHint}`}>
                  Reactivate this service to assign resources.
                </p>
              ) : allResourcesQuery.isPending ? (
                <div
                  className={`${styles.skeleton} ${styles.loadingControl}`}
                />
              ) : allResources.length === 0 ? (
                <p className={styles.hint}>
                  No resources exist in this organization yet. Add resources in
                  the Resources tab.
                </p>
              ) : unassignedResources.length === 0 ? (
                <p className={styles.hint}>
                  All organization resources are assigned to this service.
                </p>
              ) : (
                <form onSubmit={handleAssign} className={styles.assignForm}>
                  <div className={styles.selectWrapper}>
                    <label
                      htmlFor="assign-resource-select"
                      className={styles.visuallyHidden}
                    >
                      Select resource to assign
                    </label>
                    <select
                      id="assign-resource-select"
                      className={styles.nativeSelect}
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
                    <Plus aria-hidden="true" className={styles.smallIcon} />
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
