import { useState, type ReactNode } from 'react';

import { Button } from '@/components/Button';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Replaces the browser's native `confirm()` (previously the only place in
 * the admin panel that broke from its own UI vocabulary — root CLAUDE.md UI
 * audit) with a dialog that matches everything else. Confirms the same
 * action, nothing more — no new capability, just a presentational upgrade
 * of an existing confirmation step.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="w-full max-w-sm rounded-lg bg-white p-5 shadow-popover">
        <h2 id="confirm-dialog-title" className="text-sm font-semibold text-slate-900">
          {title}
        </h2>
        <div className="mt-2 text-sm text-slate-600">{description}</div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Convenience hook for the common "click a button, confirm, then act" flow. */
export function useConfirmDialog() {
  const [open, setOpen] = useState(false);
  return {
    open,
    request: () => setOpen(true),
    cancel: () => setOpen(false),
    close: () => setOpen(false),
  };
}
