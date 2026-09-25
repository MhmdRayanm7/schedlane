import { useEffect, useState } from "react";
import { ApiError } from "@/shared/api/api-error";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/components/ui/sheet";
import type { CreateResourceInput } from "../types";

type ResourceCreateSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CreateResourceInput) => Promise<void>;
  isPending: boolean;
  isReadOnly: boolean;
};

export function ResourceCreateSheet({
  open,
  onOpenChange,
  onSubmit,
  isPending,
  isReadOnly,
}: ResourceCreateSheetProps) {
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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>New resource</SheetTitle>
          <SheetDescription>
            Add a person, room, chair, or other bookable resource.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5">
          {errorMessage ? (
            <div
              className="rounded-md border border-[#e7b7b2] bg-[#fdf3f2] p-3 text-sm text-destructive"
              role="alert"
            >
              {errorMessage}
            </div>
          ) : null}

          <div className="space-y-1.5">
            <label
              htmlFor="resource-name"
              className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Name
            </label>
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
            <p className="text-xs text-subtle-foreground">
              A resource can be a staff member, chair, room, or equipment.
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
            <Button type="submit" disabled={isReadOnly || isPending}>
              {isPending ? "Creating…" : "Create resource"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
