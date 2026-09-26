import { useEffect, useState } from "react";
import { ApiError } from "@/shared/api/api-error";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { InlineAlert } from "@/shared/components/ui/inline-alert";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import { formatDuration, formatPriceIls } from "../lib/pricing";
import styles from "../services.module.css";
import type { Service } from "../types";
import { ServiceResourceAssignments } from "./service-resource-assignments";

type ServiceDetailsSheetProps = {
  service: Service | null;
  organizationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (service: Service) => void;
  onDeactivate: (serviceId: string) => Promise<void>;
  onReactivate: (serviceId: string) => Promise<void>;
  isReadOnly: boolean;
  canEditDetails?: boolean;
  isActionPending?: boolean;
};

export function ServiceDetailsSheet({
  service,
  organizationId,
  open,
  onOpenChange,
  onEdit,
  onDeactivate,
  onReactivate,
  isReadOnly,
  canEditDetails = true,
  isActionPending = false,
}: ServiceDetailsSheetProps) {
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setActionError(null);
  }, [open]);

  if (!service) return null;

  const isActive = service.deactivatedAt === null;

  async function handleConfirmDeactivate() {
    if (!service || isReadOnly || isActionPending) return;
    setActionError(null);
    try {
      await onDeactivate(service.id);
      setDeactivateDialogOpen(false);
    } catch (err) {
      if (err instanceof ApiError) {
        setActionError(err.message || "Failed to deactivate service.");
      } else {
        setActionError("An unexpected error occurred.");
      }
    }
  }

  async function handleReactivate() {
    if (!service || isReadOnly || isActionPending) return;
    setActionError(null);
    try {
      await onReactivate(service.id);
    } catch (err) {
      if (err instanceof ApiError) {
        setActionError(err.message || "Failed to reactivate service.");
      } else {
        setActionError("An unexpected error occurred.");
      }
    }
  }

  return (
    <>
      <Sheet open={open && !deactivateDialogOpen} onOpenChange={onOpenChange}>
        <SheetContent>
          <SheetHeader>
            <div className={styles.statusLine}>
              <span className={styles.statusBadge} data-active={isActive}>
                <span className={styles.statusBadgeDot} aria-hidden="true" />
                {isActive ? "Active" : "Inactive"}
              </span>
            </div>
            <SheetTitle className={styles.sheetTitle}>
              {service.name}
            </SheetTitle>
            <SheetDescription className={styles.visuallyHidden}>
              Service details
            </SheetDescription>
          </SheetHeader>

          {actionError ? (
            <InlineAlert variant="error" className={styles.sheetAlert}>
              {actionError}
            </InlineAlert>
          ) : null}

          <div className={styles.facts}>
            <div className={styles.fact}>
              <span className={styles.factLabel}>Duration</span>
              <span className={styles.factValue}>
                {formatDuration(service.durationMinutes)}
              </span>
            </div>

            <div className={styles.fact}>
              <span className={styles.factLabel}>Price</span>
              <span className={styles.factValue}>
                {formatPriceIls(service.priceAgorot) ?? "—"}
              </span>
            </div>

            <div className={styles.fact}>
              <span className={styles.factLabel}>Buffer after</span>
              <span className={styles.factValue}>
                {service.bufferAfterMinutes > 0
                  ? `${service.bufferAfterMinutes} min`
                  : "None"}
              </span>
            </div>
          </div>

          {!isReadOnly ? (
            <div className={styles.sheetActions}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onEdit(service);
                }}
                disabled={isActionPending || !canEditDetails}
              >
                Edit details
              </Button>

              {isActive ? (
                <Button
                  variant="destructiveOutline"
                  size="sm"
                  onClick={() => {
                    setActionError(null);
                    setDeactivateDialogOpen(true);
                  }}
                  disabled={isActionPending}
                >
                  Deactivate
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReactivate}
                  disabled={isActionPending}
                  className={styles.reactivate}
                >
                  Reactivate
                </Button>
              )}
            </div>
          ) : null}

          <div className={styles.assignmentsArea}>
            <ServiceResourceAssignments
              organizationId={organizationId}
              serviceId={service.id}
              isServiceActive={isActive}
              isReadOnly={isReadOnly}
            />
          </div>
        </SheetContent>
      </Sheet>

      <Dialog
        open={deactivateDialogOpen}
        onOpenChange={(nextOpen) => {
          if (!isActionPending) setDeactivateDialogOpen(nextOpen);
        }}
      >
        <DialogContent aria-busy={isActionPending}>
          <DialogTitle>Deactivate service</DialogTitle>
          <DialogDescription>
            Are you sure you want to deactivate "{service.name}"? It will no
            longer be available for new bookings. Existing appointments are
            preserved.
          </DialogDescription>
          {actionError ? (
            <InlineAlert as="p" variant="error" className={styles.sheetAlert}>
              {actionError}
            </InlineAlert>
          ) : null}
          <div className={styles.dialogActions}>
            <DialogClose asChild>
              <Button variant="outline" disabled={isActionPending}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={handleConfirmDeactivate}
              disabled={isActionPending}
            >
              {isActionPending ? "Deactivating…" : "Deactivate service"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
