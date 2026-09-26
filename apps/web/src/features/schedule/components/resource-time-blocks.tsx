import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { ApiError } from "@/shared/api/api-error";
import { Button } from "@/shared/components/ui/button";
import { formatInterval, timeToMinute, validateInterval } from "../lib/time";
import type {
  ManageableResource,
  MinuteInterval,
  TimeBlockItem,
} from "../types";
import { TimeInput } from "./time-input";

type ResourceTimeBlocksProps = {
  date: string;
  resource: ManageableResource | undefined;
  timeBlocks: TimeBlockItem[];
  isLoading: boolean;
  isReadOnly?: boolean;
  onCreateBlock: (interval: MinuteInterval) => Promise<unknown>;
  onDeleteBlock: (timeBlockId: string) => Promise<unknown>;
  isCreating: boolean;
  deletingBlockId: string | null;
};

export function ResourceTimeBlocks({
  date,
  resource,
  timeBlocks,
  isLoading,
  isReadOnly = false,
  onCreateBlock,
  onDeleteBlock,
  isCreating,
  deletingBlockId,
}: ResourceTimeBlocksProps) {
  const isResourceInactive = Boolean(resource?.deactivatedAt);
  const isWritesDisabled = isReadOnly || isResourceInactive;

  const [startStr, setStartStr] = useState("12:00");
  const [endStr, setEndStr] = useState("13:00");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sortedBlocks = [...timeBlocks].sort(
    (a, b) => a.startMinute - b.startMinute,
  );

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isWritesDisabled || isCreating) return;
    setErrorMessage(null);

    const startMinute = timeToMinute(startStr);
    const endMinute = timeToMinute(endStr);

    if (startMinute === null) {
      setErrorMessage(`Invalid start time "${startStr}". Use HH:mm format.`);
      return;
    }
    if (endMinute === null) {
      setErrorMessage(`Invalid end time "${endStr}". Use HH:mm format.`);
      return;
    }

    const intervalError = validateInterval({ startMinute, endMinute });
    if (intervalError) {
      setErrorMessage(intervalError);
      return;
    }

    // Client-side check for obvious overlap
    const hasOverlap = timeBlocks.some(
      (b) => startMinute < b.endMinute && endMinute > b.startMinute,
    );
    if (hasOverlap) {
      setErrorMessage("This time overlaps an existing blocked period.");
      return;
    }

    try {
      await onCreateBlock({ startMinute, endMinute });
      // Reset inputs to clean defaults
      setStartStr("13:00");
      setEndStr("14:00");
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.code === "TIME_BLOCK_OVERLAP") {
          setErrorMessage("This time overlaps an existing blocked period.");
          return;
        }
        if (err.code === "INVALID_TIME_BLOCK") {
          setErrorMessage("Invalid time block intervals.");
          return;
        }
      }
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to add time block.",
      );
    }
  };

  const handleDelete = async (id: string) => {
    if (isWritesDisabled || deletingBlockId) return;
    setErrorMessage(null);
    try {
      await onDeleteBlock(id);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.code === "TIME_BLOCK_NOT_FOUND") {
        setErrorMessage("Time block was already removed.");
        return;
      }
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to remove time block.",
      );
    }
  };

  if (!resource) return null;

  return (
    <div className="border-t border-border">
      <div className="py-4">
        <h3 className="text-sm font-semibold text-foreground">
          Time away / blocked time
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Set temporary unavailable periods inside {resource.name}'s day on{" "}
          {date}.
        </p>
      </div>

      <div className="space-y-4 pb-5">
        {isLoading ? (
          <div aria-busy="true" className="space-y-2 py-2" role="status">
            <div className="h-6 w-48 rounded bg-border animate-pulse" />
            <div className="h-6 w-36 rounded bg-border animate-pulse" />
          </div>
        ) : sortedBlocks.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No blocked time recorded for this date.
          </p>
        ) : (
          <div className="divide-y divide-border rounded-md border border-border">
            {sortedBlocks.map((block) => (
              <div
                key={block.id}
                className="flex items-center justify-between p-3"
              >
                <span className="font-mono text-xs font-medium text-foreground">
                  {formatInterval({
                    startMinute: block.startMinute,
                    endMinute: block.endMinute,
                  })}
                </span>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isWritesDisabled || deletingBlockId === block.id}
                  onClick={() => handleDelete(block.id)}
                  className="h-9 text-xs text-muted-foreground hover:text-destructive"
                >
                  <Trash2 aria-hidden="true" className="size-3.5" />
                  {deletingBlockId === block.id ? "Removing…" : "Remove"}
                </Button>
              </div>
            ))}
          </div>
        )}

        {!isWritesDisabled && (
          <form
            onSubmit={handleAdd}
            className="flex flex-wrap items-end gap-3 pt-2"
          >
            <div>
              <p className="mb-1.5 block text-sm font-medium text-muted-foreground">
                Start
              </p>
              <TimeInput
                label="Time block start"
                boundary="start"
                value={startStr}
                onChange={(value) => {
                  setErrorMessage(null);
                  setStartStr(value);
                }}
                disabled={isCreating}
              />
            </div>

            <div>
              <p className="mb-1.5 block text-sm font-medium text-muted-foreground">
                End
              </p>
              <TimeInput
                label="Time block end"
                boundary="end"
                value={endStr}
                onChange={(value) => {
                  setErrorMessage(null);
                  setEndStr(value);
                }}
                disabled={isCreating}
              />
            </div>

            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={isCreating}
              className="h-8 text-xs"
            >
              <Plus aria-hidden="true" className="size-3.5" />
              {isCreating ? "Adding…" : "Add time block"}
            </Button>
          </form>
        )}

        {errorMessage && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {errorMessage}
          </p>
        )}
      </div>
    </div>
  );
}
