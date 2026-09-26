import { useEffect, useState } from "react";
import { ApiError } from "@/shared/api/api-error";
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
import type { CreateResourceInput } from "../types";

type ResourceCreateDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CreateResourceInput) => Promise<void>;
  isPending: boolean;
  isReadOnly: boolean;
};

export function ResourceCreateDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
  isReadOnly,
}: ResourceCreateDialogProps) {
  const [name, setName] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setErrorMessage(null);
    }
  }, [open]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isReadOnly || isPending) return;

    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMessage("Resource name is required.");
      return;
    }

    setErrorMessage(null);

    try {
      await onSubmit({ name: trimmedName });
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError) {
        switch (error.code) {
          case "RESOURCE_MANAGEMENT_NOT_ALLOWED":
            setErrorMessage("Your role does not allow creating resources.");
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
            setErrorMessage(error.message || "Failed to create resource.");
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
      <DialogContent className="max-w-[460px]" aria-busy={isPending}>
        <header>
          <DialogTitle>New resource</DialogTitle>
          <DialogDescription>
            Add a person, room, chair, or other bookable resource.
          </DialogDescription>
        </header>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {errorMessage ? (
            <InlineAlert variant="error" className="p-3">
              {errorMessage}
            </InlineAlert>
          ) : null}

          <FormField htmlFor="resource-name" label="Name">
            <Input
              id="resource-name"
              type="text"
              required
              disabled={isReadOnly || isPending}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Chair 1, Room 102, or Barber"
              maxLength={120}
            />
          </FormField>

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
              Create resource
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
