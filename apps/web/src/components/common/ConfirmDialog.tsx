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
          className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
            isDanger ? 'bg-[#F43F5E]/15 text-[#F43F5E]' : 'bg-[#FF6B35]/15 text-[#FF7A45]'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
        </div>
      }
    >
      <div className="space-y-4">
        {bodyText && (
          <p className="text-sm text-zinc-400 leading-relaxed">
            {bodyText}
          </p>
        )}

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#2C2826]">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-300 hover:text-white hover:bg-white/5 border border-white/10 focus-visible:ring-2 focus-visible:ring-white focus:outline-none transition disabled:opacity-40"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 focus-visible:ring-2 focus:outline-none transition disabled:opacity-50 shadow-sm ${
              isDanger
                ? 'bg-[#F43F5E] hover:bg-[#E11D48] text-white focus-visible:ring-[#F43F5E]'
                : 'bg-white hover:bg-zinc-200 text-black focus-visible:ring-white'
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
