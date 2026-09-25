import { ChevronRight, Link2, Unlink2 } from "lucide-react";
import { cn } from "@/shared/lib/cn";
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
    <ul
      aria-label="Resources list"
      className="divide-y divide-border rounded-lg border border-border bg-surface"
    >
      {resources.map((resource) => {
        const isActive = resource.deactivatedAt === null;

        return (
          <li key={resource.id}>
            <button
              type="button"
              className={cn(
                "group flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left transition-colors duration-150 hover:bg-background/80 sm:px-5 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus",
                !isActive && "opacity-65 bg-background/40",
              )}
              onClick={() => onSelectResource(resource)}
              aria-label={`${resource.name}, ${isActive ? "Active" : "Inactive"}, ${resource.isLinked ? "Linked to team member" : "Unlinked"}`}
            >
              <div className="flex items-center gap-3.5 min-w-0">
                {/* Status Dot */}
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    isActive ? "bg-[#2e7d32]" : "bg-[#9aa0a6]",
                  )}
                  title={isActive ? "Active" : "Inactive"}
                  aria-hidden="true"
                />

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground truncate text-sm">
                      {resource.name}
                    </span>
                    {!isActive ? (
                      <span className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium bg-muted text-muted-foreground">
                        Inactive
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-1 flex items-center gap-2 text-xs">
                    {resource.isLinked ? (
                      <span className="inline-flex items-center gap-1 text-primary font-medium">
                        <Link2 aria-hidden="true" className="size-3" />
                        Linked to team member
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <Unlink2
                          aria-hidden="true"
                          className="size-3 text-subtle-foreground"
                        />
                        Unlinked
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <ChevronRight
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-foreground"
              />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
