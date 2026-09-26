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
import { cn } from "@/shared/lib/cn";
import { formatDuration, formatPriceIls } from "../lib/pricing";
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
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium",
                  isActive
                    ? "bg-primary-subtle text-primary"
                    : "bg-background text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    isActive ? "bg-primary" : "bg-subtle-foreground",
                  )}
                  aria-hidden="true"
                />
                {isActive ? "Active" : "Inactive"}
              </span>
            </div>
            <SheetTitle className="text-xl font-semibold text-foreground">
              {service.name}
            </SheetTitle>
            <SheetDescription className="sr-only">
              Service details
            </SheetDescription>
          </SheetHeader>

          {actionError ? (
            <InlineAlert variant="error" className="mt-4 p-3">
              {actionError}
            </InlineAlert>
          ) : null}

          <div className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between items-center gap-4 py-2 border-b border-border/50">
              <span className="text-muted-foreground">Duration</span>
              <span className="font-medium text-foreground">
                {formatDuration(service.durationMinutes)}
              </span>
            </div>

            <div className="flex justify-between items-center gap-4 py-2 border-b border-border/50">
              <span className="text-muted-foreground">Price</span>
              <span className="font-medium text-foreground">
                {formatPriceIls(service.priceAgorot) ?? "—"}
              </span>
            </div>

            <div className="flex justify-between items-center gap-4 py-2">
              <span className="text-muted-foreground">Buffer after</span>
              <span className="font-medium text-foreground">
                {service.bufferAfterMinutes > 0
                  ? `${service.bufferAfterMinutes} min`
                  : "None"}
              </span>
            </div>
          </div>

          {!isReadOnly ? (
            <div className="mt-6 flex flex-wrap gap-2.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onEdit(service);
                }}
                disabled={isActionPending}
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
                  className="text-primary hover:bg-primary-subtle"
                >
                  Reactivate
                </Button>
              )}
            </div>
          ) : null}

          <div className="mt-6 border-t border-border pt-5">
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
            <InlineAlert as="p" variant="error" className="mt-4 p-3">
              {actionError}
            </InlineAlert>
          ) : null}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
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
