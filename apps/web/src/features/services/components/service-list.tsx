import { ChevronRight } from "lucide-react";
import { formatDuration, formatPriceIls } from "../lib/pricing";
import styles from "../services.module.css";
import type { Service } from "../types";

type ServiceListProps = {
  services: Service[];
  onSelectService: (service: Service) => void;
};

export function ServiceList({ services, onSelectService }: ServiceListProps) {
  return (
    <ul aria-label="Services list" className={styles.list}>
      {services.map((service) => {
        const isActive = service.deactivatedAt === null;
        const formattedPrice = formatPriceIls(service.priceAgorot);

        return (
          <li key={service.id}>
            <button
              type="button"
              className={styles.row}
              data-active={isActive}
              onClick={() => onSelectService(service)}
              aria-label={`${service.name}, ${isActive ? "Active" : "Inactive"}, ${formatDuration(service.durationMinutes)}${formattedPrice ? `, ${formattedPrice}` : ""}`}
            >
              <div className={styles.rowSummary}>
                <span
                  className={styles.statusDot}
                  title={isActive ? "Active" : "Inactive"}
                  aria-hidden="true"
                />

                <div className={styles.rowCopy}>
                  <div className={styles.nameLine}>
                    <span className={styles.serviceName}>{service.name}</span>
                    {!isActive ? (
                      <span className={styles.inactiveBadge}>Inactive</span>
                    ) : null}
                  </div>

                  <div className={styles.metadata}>
                    <span>{formatDuration(service.durationMinutes)}</span>

                    {formattedPrice ? (
                      <>
                        <span
                          aria-hidden="true"
                          className={styles.metadataSeparator}
                        >
                          •
                        </span>
                        <span className={styles.price}>{formattedPrice}</span>
                      </>
                    ) : null}

                    {service.bufferAfterMinutes > 0 ? (
                      <>
                        <span
                          aria-hidden="true"
                          className={styles.metadataSeparator}
                        >
                          •
                        </span>
                        <span>+{service.bufferAfterMinutes}m buffer</span>
                      </>
                    ) : null}
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
