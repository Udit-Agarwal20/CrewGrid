import { useRef } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
  isDestructive?: boolean;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  description,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant,
  isDestructive = false,
  isLoading = false,
  onConfirm,
  onCancel
}: ConfirmDialogProps) {
  const effectiveVariant = variant || (isDestructive ? 'danger' : 'primary');
  const isDanger = effectiveVariant === 'danger';
  const bodyText = description || message || '';

  // For destructive confirmations, default initial focus to Cancel (safe action)
  // For non-destructive confirmations, focus the action button
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  const initialFocusRef = isDanger ? cancelButtonRef : confirmButtonRef;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={title}
      maxWidth="max-w-md"
      isSubmitting={isLoading}
      initialFocusRef={initialFocusRef}
      icon={
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
            isDanger ? 'bg-[#F87171]/15 text-[#F87171]' : 'bg-[#9BF5CC]/15 text-[#9BF5CC]'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
        </div>
      }
    >
      <div className="space-y-4">
        {bodyText && (
          <p className="text-sm text-[#B5C1D4] leading-relaxed">
            {bodyText}
          </p>
        )}

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#35405A]">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-[#B5C1D4] hover:text-[#E9EDF5] hover:bg-[#222A42] border border-[#35405A] focus-visible:ring-2 focus-visible:ring-[#9BF5CC] focus:outline-none transition disabled:opacity-40"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 focus-visible:ring-2 focus-visible:ring-offset-2 focus:outline-none transition disabled:opacity-50 shadow-sm ${
              isDanger
                ? 'bg-[#F87171] hover:bg-[#ef4444] text-white focus-visible:ring-[#F87171]'
                : 'bg-[#9BF5CC] hover:bg-[#86e0b7] text-[#0B1020] focus-visible:ring-[#9BF5CC]'
            }`}
          >
            {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
