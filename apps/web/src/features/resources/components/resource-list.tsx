import { ChevronRight, Link2, Unlink2 } from "lucide-react";
import styles from "../resources.module.css";
import type { Resource } from "../types";

type ResourceListProps = {
  resources: Resource[];
  onSelectResource: (resource: Resource) => void;
};

export function ResourceList({
  resources,
  onSelectResource,
}: ResourceListProps) {
  return (
    <ul aria-label="Resources list" className={styles.list}>
      {resources.map((resource) => {
        const isActive = resource.deactivatedAt === null;

        return (
          <li key={resource.id}>
            <button
              type="button"
              className={styles.row}
              data-active={isActive}
              onClick={() => onSelectResource(resource)}
              aria-label={`${resource.name}, ${isActive ? "Active" : "Inactive"}, ${resource.isLinked ? "Linked to team member" : "Unlinked"}`}
            >
              <div className={styles.rowSummary}>
                <span
                  className={styles.statusDot}
                  title={isActive ? "Active" : "Inactive"}
                  aria-hidden="true"
                />

                <div className={styles.rowCopy}>
                  <div className={styles.nameLine}>
                    <span className={styles.resourceName}>{resource.name}</span>
                    {!isActive ? (
                      <span className={styles.inactiveBadge}>Inactive</span>
                    ) : null}
                  </div>

                  <div className={styles.linkMetadata}>
                    {resource.isLinked ? (
                      <span className={styles.linked}>
                        <Link2 aria-hidden="true" className={styles.tinyIcon} />
                        Linked to team member
                      </span>
                    ) : (
                      <span className={styles.unlinked}>
                        <Unlink2
                          aria-hidden="true"
                          className={styles.tinyIcon}
                        />
                        Unlinked
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <ChevronRight aria-hidden="true" className={styles.chevron} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
