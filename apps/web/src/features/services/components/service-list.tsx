import { ChevronRight } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { formatDuration, formatPriceIls } from "../lib/pricing";
import type { Service } from "../types";

type ServiceListProps = {
  services: Service[];
  onSelectService: (service: Service) => void;
};

export function ServiceList({ services, onSelectService }: ServiceListProps) {
  return (
    <ul
      aria-label="Services list"
      className="divide-y divide-border border-y border-border"
    >
      {services.map((service) => {
        const isActive = service.deactivatedAt === null;
        const formattedPrice = formatPriceIls(service.priceAgorot);

        return (
          <li key={service.id}>
            <button
              type="button"
              className={cn(
                "group flex w-full items-center justify-between gap-4",
                "px-4 py-3.5 text-left",
                "transition-colors duration-150",
                "hover:bg-surface-hover",
                "focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus",
                "sm:px-5",
                !isActive && "bg-background text-muted-foreground",
              )}
              onClick={() => onSelectService(service)}
              aria-label={`${service.name}, ${isActive ? "Active" : "Inactive"}, ${formatDuration(service.durationMinutes)}${formattedPrice ? `, ${formattedPrice}` : ""}`}
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    isActive ? "bg-primary" : "bg-subtle-foreground",
                  )}
                  title={isActive ? "Active" : "Inactive"}
                  aria-hidden="true"
                />

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground truncate text-sm">
                      {service.name}
                    </span>
                    {!isActive ? (
                      <span className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium bg-background text-muted-foreground">
                        Inactive
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 text-xs text-muted-foreground">
                    <span>{formatDuration(service.durationMinutes)}</span>

                    {formattedPrice ? (
                      <>
                        <span aria-hidden="true" className="text-border-strong">
                          •
                        </span>
                        <span className="font-medium text-foreground">
                          {formattedPrice}
                        </span>
                      </>
                    ) : null}

                    {service.bufferAfterMinutes > 0 ? (
                      <>
                        <span aria-hidden="true" className="text-border-strong">
                          •
                        </span>
                        <span>+{service.bufferAfterMinutes}m buffer</span>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>

              <ChevronRight
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground transition-colors duration-150 group-hover:text-foreground"
              />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
