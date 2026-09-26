import styles from "./discard-changes-dialog.module.css";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";

type DiscardChangesDialogProps = {
  open: boolean;
  onCancel: () => void;
  onDiscard: () => void;
};

export function DiscardChangesDialog({
  open,
  onCancel,
  onDiscard,
}: DiscardChangesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onCancel()}>
      <DialogContent className={styles.content}>
        <DialogTitle>Discard unsaved changes?</DialogTitle>
        <DialogDescription>
          Your unsaved changes will be lost if you continue.
        </DialogDescription>
        <div className={styles.actions}>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onDiscard}>
            Discard changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
