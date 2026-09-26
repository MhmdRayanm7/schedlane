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
        <DialogTitle>Unsaved changes</DialogTitle>
        <DialogDescription>
          You have changes that haven’t been saved. If you leave now, those
          changes will be lost.
        </DialogDescription>
        <div className={styles.actions}>
          <Button onClick={onCancel}>
            Keep editing
          </Button>
          <Button variant="destructiveOutline" onClick={onDiscard}>
            Discard changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
