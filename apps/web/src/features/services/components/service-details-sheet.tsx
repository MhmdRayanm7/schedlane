import { useState } from "react";
import { ApiError } from "@/shared/api/api-error";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/components/ui/dialog";
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

type ServiceDetailsSheetProps = {
  service: Service | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (service: Service) => void;
  onDeactivate: (serviceId: string) => Promise<void>;
  onReactivate: (serviceId: string) => Promise<void>;
  isReadOnly: boolean;
  isActionPending?: boolean;
  /** Child node for assigned resources (populated in assignment flow) */
  children?: React.ReactNode;
};

export function ServiceDetailsSheet({
  service,
  open,
  onOpenChange,
  onEdit,
  onDeactivate,
  onReactivate,
  isReadOnly,
  isActionPending = false,
  children,
}: ServiceDetailsSheetProps) {
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

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
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent>
          <SheetHeader>
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
                  isActive
                    ? "bg-[#e8f5e9] text-[#2e7d32]"
                    : "bg-[#f1f3f4] text-[#5f6368]",
                )}
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    isActive ? "bg-[#2e7d32]" : "bg-[#9aa0a6]",
                  )}
                  aria-hidden="true"
                />
                {isActive ? "Active" : "Inactive"}
              </span>
            </div>
            <SheetTitle className="text-xl font-semibold text-foreground">
              {service.name}
            </SheetTitle>
            <SheetDescription>
              Service configuration, pricing, and resource assignments.
            </SheetDescription>
          </SheetHeader>

          {actionError ? (
            <div
              className="mt-4 rounded-md border border-[#e7b7b2] bg-[#fdf3f2] p-3 text-sm text-destructive"
              role="alert"
            >
              {actionError}
            </div>
          ) : null}

          {/* Service Attributes */}
          <div className="mt-6 space-y-4 rounded-lg border border-border bg-background p-4 text-sm">
            <div className="flex justify-between items-center py-1 border-b border-border/50">
              <span className="text-muted-foreground">Duration</span>
              <span className="font-medium text-foreground">
                {formatDuration(service.durationMinutes)}
              </span>
            </div>

            <div className="flex justify-between items-center py-1 border-b border-border/50">
              <span className="text-muted-foreground">Price</span>
              <span className="font-medium text-foreground">
                {formatPriceIls(service.priceAgorot) ?? "—"}
              </span>
            </div>

            <div className="flex justify-between items-center py-1">
              <span className="text-muted-foreground">Buffer after</span>
              <span className="font-medium text-foreground">
                {service.bufferAfterMinutes > 0
                  ? `${service.bufferAfterMinutes} min`
                  : "None"}
              </span>
            </div>
          </div>

          {/* Action buttons */}
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
                  onClick={() => setDeactivateDialogOpen(true)}
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

          {/* Slot for Resource Assignments */}
          {children ? (
            <div className="mt-8 border-t border-border pt-6">{children}</div>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* Deactivation Confirmation Dialog */}
      <Dialog
        open={deactivateDialogOpen}
        onOpenChange={setDeactivateDialogOpen}
      >
        <DialogContent>
          <DialogTitle>Deactivate service</DialogTitle>
          <DialogDescription>
            Are you sure you want to deactivate "{service.name}"? It will no
            longer be available for new bookings. Existing appointments are
            preserved.
          </DialogDescription>
          <div className="mt-6 flex justify-end gap-3">
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
