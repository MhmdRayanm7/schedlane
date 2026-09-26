import { useEffect, useState } from "react";
import { ApiError } from "@/shared/api/api-error";
import { FormSaveStatus } from "@/shared/components/form-save-status";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { FormField } from "@/shared/components/ui/form-field";
import { InlineAlert } from "@/shared/components/ui/inline-alert";
import { Input } from "@/shared/components/ui/input";
import { useUnsavedChanges } from "@/shared/unsaved-changes/unsaved-changes";
import { agorotToIls, ilsToAgorot } from "../lib/pricing";
import styles from "../services.module.css";
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

  const parsedDuration = Number.parseInt(durationMinutes, 10);
  const parsedBuffer = Number.parseInt(bufferAfterMinutes, 10);
  const parsedPrice = ilsToAgorot(priceIls);
  const numericPrice = Number(priceIls);
  const isDirty = Boolean(
    service &&
      (name.trim() !== service.name ||
        parsedDuration !== service.durationMinutes ||
        parsedPrice !== service.priceAgorot ||
        parsedBuffer !== service.bufferAfterMinutes),
  );
  const isValid =
    Boolean(name.trim()) &&
    !Number.isNaN(parsedDuration) &&
    parsedDuration >= 1 &&
    !Number.isNaN(parsedBuffer) &&
    parsedBuffer >= 0 &&
    (!priceIls.trim() || (Number.isFinite(numericPrice) && numericPrice >= 0));
  const draftId = `service-edit:${service?.id ?? "create"}`;
  const { requestChange } = useUnsavedChanges({
    id: draftId,
    dirty: open && isEditing && isDirty,
    discard: () => {
      if (!service) return;
      setName(service.name);
      setDurationMinutes(service.durationMinutes.toString());
      setPriceIls(agorotToIls(service.priceAgorot));
      setBufferAfterMinutes(service.bufferAfterMinutes.toString());
      setErrorMessage(null);
    },
  });

  const requestClose = () => {
    requestChange(() => onOpenChange(false), { ids: [draftId] });
  };

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

    const duration = parsedDuration;
    if (Number.isNaN(duration) || duration < 1) {
      setErrorMessage("Duration must be at least 1 minute.");
      return;
    }

    const buffer = parsedBuffer;
    if (Number.isNaN(buffer) || buffer < 0) {
      setErrorMessage("Buffer after must be 0 or more minutes.");
      return;
    }

    const priceAgorot = parsedPrice;

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
        if (isPending) return;
        if (nextOpen) onOpenChange(true);
        else requestClose();
      }}
    >
      <DialogContent className={styles.formDialog} aria-busy={isPending}>
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

        <form onSubmit={handleSubmit} className={styles.form}>
          {errorMessage ? (
            <InlineAlert variant="error" className={styles.alert}>
              {errorMessage}
            </InlineAlert>
          ) : null}

          <FormField htmlFor="service-name" label="Name">
            <Input
              id="service-name"
              type="text"
              required
              disabled={isReadOnly || isPending}
              value={name}
              onChange={(e) => {
                setErrorMessage(null);
                setName(e.target.value);
              }}
              placeholder="e.g. Standard Haircut"
              maxLength={120}
            />
          </FormField>

          <div className={styles.formGrid}>
            <FormField htmlFor="service-duration" label="Duration (min)">
              <Input
                id="service-duration"
                type="number"
                min="1"
                step="1"
                required
                disabled={isReadOnly || isPending}
                value={durationMinutes}
                onChange={(e) => {
                  setErrorMessage(null);
                  setDurationMinutes(e.target.value);
                }}
              />
            </FormField>

            <FormField htmlFor="service-buffer" label="Buffer after (min)">
              <Input
                id="service-buffer"
                type="number"
                min="0"
                step="1"
                disabled={isReadOnly || isPending}
                value={bufferAfterMinutes}
                onChange={(e) => {
                  setErrorMessage(null);
                  setBufferAfterMinutes(e.target.value);
                }}
              />
            </FormField>
          </div>

          <FormField
            htmlFor="service-price"
            label="Price (ILS ₪)"
            helperText="Entered in Shekels (₪). Leave empty if pricing is disabled."
          >
            <Input
              id="service-price"
              type="number"
              min="0"
              step="0.01"
              disabled={isReadOnly || isPending}
              value={priceIls}
              onChange={(e) => {
                setErrorMessage(null);
                setPriceIls(e.target.value);
              }}
              placeholder={pricingEnabled ? "e.g. 70" : "Optional (e.g. 70)"}
            />
          </FormField>

          <div className={styles.formActions}>
            {isEditing ? (
              <div className={styles.formSaveStatus}>
                <FormSaveStatus
                  dirty={isDirty}
                  saving={isPending}
                  successState="hidden"
                />
              </div>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={requestClose}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              loading={isPending}
              loadingLabel={isEditing ? "Saving..." : "Creating..."}
              type="submit"
              disabled={
                isReadOnly || isPending || !isValid || (isEditing && !isDirty)
              }
            >
              {isEditing ? "Save changes" : "Create service"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
