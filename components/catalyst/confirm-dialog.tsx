'use client';

import {
  Dialog,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogActions,
} from '@/components/catalyst/dialog';
import { Button } from '@/components/catalyst/button';

type ConfirmDialogProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  /** Error message to show inside the dialog (e.g. when confirm failed) */
  error?: string | null;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmColor?: 'red' | 'zinc' | 'blue';
  isLoading?: boolean;
};

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  error,
  confirmLabel = 'Bevestigen',
  cancelLabel = 'Annuleren',
  confirmColor = 'red',
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
        {error && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400 whitespace-pre-line">
            {error}
          </div>
        )}
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
          {isLoading ? 'Bezig...' : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
