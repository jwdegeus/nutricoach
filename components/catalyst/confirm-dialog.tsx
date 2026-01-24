"use client";

import {
  Dialog,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogActions,
} from "@/components/catalyst/dialog";
import { Button } from "@/components/catalyst/button";

type ConfirmDialogProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmColor?: "red" | "zinc" | "blue";
  isLoading?: boolean;
};

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Bevestigen",
  cancelLabel = "Annuleren",
  confirmColor = "red",
  isLoading = false,
}: ConfirmDialogProps) {
  const handleConfirm = () => {
    onConfirm();
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>{title}</DialogTitle>
      <DialogDescription>{description}</DialogDescription>
      <DialogBody>
        {/* Empty body - description is already shown */}
      </DialogBody>
      <DialogActions>
        <Button outline onClick={onClose} disabled={isLoading}>
          {cancelLabel}
        </Button>
        <Button
          color={confirmColor}
          onClick={handleConfirm}
          disabled={isLoading}
        >
          {isLoading ? "Bezig..." : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
