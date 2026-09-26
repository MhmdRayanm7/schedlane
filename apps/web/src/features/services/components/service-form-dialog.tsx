import { useEffect, useState } from "react";
import { ApiError } from "@/shared/api/api-error";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { agorotToIls, ilsToAgorot } from "../lib/pricing";
import type { CreateServiceInput, Service, UpdateServiceInput } from "../types";

type ServiceFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  service?: Service | null;
  onSubmit: (data: CreateServiceInput | UpdateServiceInput) => Promise<void>;
  isPending: boolean;
  isReadOnly: boolean;
  /** Whether pricing is known to be enabled in this organization */
  pricingEnabled?: boolean;
};

export function ServiceFormDialog({
  open,
  onOpenChange,
  service,
  onSubmit,
  isPending,
  isReadOnly,
  pricingEnabled,
}: ServiceFormDialogProps) {
  const isEditing = Boolean(service);

  const [name, setName] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("30");
  const [priceIls, setPriceIls] = useState("");
  const [bufferAfterMinutes, setBufferAfterMinutes] = useState("0");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      if (service) {
        setName(service.name);
        setDurationMinutes(service.durationMinutes.toString());
        setPriceIls(agorotToIls(service.priceAgorot));
        setBufferAfterMinutes(service.bufferAfterMinutes.toString());
      } else {
        setName("");
        setDurationMinutes("30");
        setPriceIls("");
        setBufferAfterMinutes("0");
      }
      setErrorMessage(null);
    }
  }, [open, service]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isReadOnly || isPending) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMessage("Service name is required.");
      return;
    }

    const duration = Number.parseInt(durationMinutes, 10);
    if (Number.isNaN(duration) || duration < 1) {
      setErrorMessage("Duration must be at least 1 minute.");
      return;
    }

    const buffer = Number.parseInt(bufferAfterMinutes, 10);
    if (Number.isNaN(buffer) || buffer < 0) {
      setErrorMessage("Buffer after must be 0 or more minutes.");
      return;
    }

    const priceAgorot = ilsToAgorot(priceIls);

    setErrorMessage(null);

    try {
      if (isEditing) {
        await onSubmit({
          name: trimmedName,
          durationMinutes: duration,
          priceAgorot,
          bufferAfterMinutes: buffer,
        });
      } else {
        await onSubmit({
          name: trimmedName,
          durationMinutes: duration,
          priceAgorot,
          bufferAfterMinutes: buffer,
        });
      }
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError) {
        switch (error.code) {
          case "SERVICE_PRICE_REQUIRED":
            setErrorMessage(
              "A price is required while organization pricing is enabled.",
            );
            return;
          case "ORGANIZATION_PRICING_DISABLED":
            setErrorMessage(
              "Organization pricing is disabled. Clear the price to save.",
            );
            return;
          case "SERVICE_MANAGEMENT_NOT_ALLOWED":
            setErrorMessage("Your role does not allow modifying services.");
            return;
          case "ORGANIZATION_ARCHIVED":
            setErrorMessage(
              "This organization is archived and cannot be modified.",
            );
            return;
          case "ORGANIZATION_SUSPENDED":
            setErrorMessage(
              "This organization is suspended and cannot be modified.",
            );
            return;
          default:
            setErrorMessage(error.message || "Failed to save service.");
            return;
        }
      }
      setErrorMessage("An unexpected error occurred. Please try again.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isPending) onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="max-w-[520px]" aria-busy={isPending}>
        <header>
          <DialogTitle>
            {isEditing ? "Edit service" : "New service"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update service details, timing, and pricing."
              : "Add a service that can be booked by clients."}
          </DialogDescription>
        </header>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {errorMessage ? (
            <div
              className="rounded-md border border-destructive/25 bg-destructive-subtle p-3 text-sm text-destructive"
              role="alert"
            >
              {errorMessage}
            </div>
          ) : null}

          <div className="space-y-1.5">
            <label
              htmlFor="service-name"
              className="block text-sm font-medium text-foreground"
            >
              Name
            </label>
            <Input
              id="service-name"
              type="text"
              required
              disabled={isReadOnly || isPending}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Standard Haircut"
              maxLength={120}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 min-[400px]:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor="service-duration"
                className="block text-sm font-medium text-foreground"
              >
                Duration (min)
              </label>
              <Input
                id="service-duration"
                type="number"
                min="1"
                step="1"
                required
                disabled={isReadOnly || isPending}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="service-buffer"
                className="block text-sm font-medium text-foreground"
              >
                Buffer after (min)
              </label>
              <Input
                id="service-buffer"
                type="number"
                min="0"
                step="1"
                disabled={isReadOnly || isPending}
                value={bufferAfterMinutes}
                onChange={(e) => setBufferAfterMinutes(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="service-price"
              className="block text-sm font-medium text-foreground"
            >
              Price (ILS ₪)
            </label>
            <Input
              id="service-price"
              type="number"
              min="0"
              step="0.01"
              disabled={isReadOnly || isPending}
              value={priceIls}
              onChange={(e) => setPriceIls(e.target.value)}
              placeholder={pricingEnabled ? "e.g. 70" : "Optional (e.g. 70)"}
            />
            <p className="text-xs text-subtle-foreground">
              Entered in Shekels (₪). Leave empty if pricing is disabled.
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              loading={isPending}
              type="submit"
              disabled={isReadOnly || isPending}
            >
              {isEditing ? "Save changes" : "Create service"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
