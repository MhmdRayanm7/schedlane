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
import styles from "./schedule-exceptions.module.css";
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
    <div className={styles.blocks}>
      <div className={styles.sectionHeader}>
        <h3 className={styles.title}>Time away / blocked time</h3>
        <p className={styles.description}>
          Set temporary unavailable periods inside {resource.name}'s day on{" "}
          {date}.
        </p>
      </div>

      <div className={styles.sectionContent}>
        {isLoading ? (
          <div aria-busy="true" className={styles.blocksLoading} role="status">
            <div className={`${styles.skeleton} ${styles.blockSkeletonWide}`} />
            <div className={`${styles.skeleton} ${styles.blockSkeleton}`} />
          </div>
        ) : sortedBlocks.length === 0 ? (
          <p className={styles.emptyBlocks}>
            No blocked time recorded for this date.
          </p>
        ) : (
          <div className={styles.blockList}>
            {sortedBlocks.map((block) => (
              <div key={block.id} className={styles.blockRow}>
                <span className={styles.blockTime}>
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
                  className={styles.removeBlock}
                >
                  <Trash2 aria-hidden="true" className={styles.smallIcon} />
                  {deletingBlockId === block.id ? "Removing…" : "Remove"}
                </Button>
              </div>
            ))}
          </div>
        )}

        {!isWritesDisabled && (
          <form onSubmit={handleAdd} className={styles.blockForm}>
            <div>
              <p className={styles.fieldLabel}>Start</p>
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
              <p className={styles.fieldLabel}>End</p>
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
              className={styles.addButton}
            >
              <Plus aria-hidden="true" className={styles.smallIcon} />
              {isCreating ? "Adding…" : "Add time block"}
            </Button>
          </form>
        )}

        {errorMessage && (
          <p role="alert" className={styles.error}>
            {errorMessage}
          </p>
        )}
      </div>
    </div>
  );
}
