import React, { useEffect, useRef, useId } from 'react';
import { X } from 'lucide-react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(', ');

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  icon?: React.ReactNode;
  maxWidth?: string; // e.g. 'max-w-md', 'max-w-lg', 'max-w-xl'
  isSubmitting?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  showCloseButton?: boolean;
  closeButtonAriaLabel?: string;
  className?: string;
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  icon,
  maxWidth = 'max-w-lg',
  isSubmitting = false,
  initialFocusRef,
  showCloseButton = true,
  closeButtonAriaLabel = 'Close dialog',
  className = ''
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

  const titleId = useId();
  const descriptionId = useId();

  // Save the invoking trigger element when modal opens, and restore focus on close
  useEffect(() => {
    if (isOpen) {
      previouslyFocusedElementRef.current = document.activeElement as HTMLElement | null;

      // Lock body scroll while modal is active
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      // Initial focus management: focus immediately and schedule a fallback for async sub-trees
      const setInitialFocus = () => {
        if (initialFocusRef?.current) {
          initialFocusRef.current.focus();
        } else if (dialogRef.current) {
          const focusables = dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
          const firstFocusable = Array.from(focusables).find(
            (el) => !el.hasAttribute('disabled') && el.getAttribute('tabindex') !== '-1'
          );
          if (firstFocusable) {
            firstFocusable.focus();
          } else {
            dialogRef.current.focus();
          }
        }
      };

      setInitialFocus();
      const timer = setTimeout(setInitialFocus, 30);

      return () => {
        clearTimeout(timer);
        document.body.style.overflow = originalOverflow;
        // Restore focus to trigger element
        if (previouslyFocusedElementRef.current && typeof previouslyFocusedElementRef.current.focus === 'function') {
          previouslyFocusedElementRef.current.focus();
        }
      };
    }
    return undefined;
  }, [isOpen, initialFocusRef]);

  // Keyboard navigation: Escape to close and Tab focus trapping
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!isSubmitting) {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
        return;
      }

      if (e.key === 'Tab') {
        if (!dialogRef.current) return;

        const focusableElements = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        ).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null);

        if (focusableElements.length === 0) {
          e.preventDefault();
          return;
        }

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          // Shift + Tab: if on first element, wrap to last
          if (document.activeElement === firstElement || !dialogRef.current.contains(document.activeElement)) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          // Tab: if on last element, wrap to first
          if (document.activeElement === lastElement || !dialogRef.current.contains(document.activeElement)) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-describedby={description ? descriptionId : undefined}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm overflow-y-auto"
      onClick={(e) => {
        // Light dismiss on backdrop click only if not actively submitting a mutation
        if (e.target === e.currentTarget && !isSubmitting) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={`w-full ${maxWidth} p-6 sm:p-7 rounded-2xl bg-[#111114] border border-[#2C2826] shadow-2xl text-white my-8 focus:outline-none ${className}`}
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between pb-4 border-b border-[#2C2826] gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {icon && (
              <span className="w-9 h-9 rounded-xl bg-[#18181C] border border-[#2C2826] text-[#FF7A45] flex items-center justify-center shrink-0">
                {icon}
              </span>
            )}
            <div className="min-w-0">
              <h2 id={titleId} className="font-display text-lg font-bold text-white truncate">
                {title}
              </h2>
              {description && (
                <p id={descriptionId} className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
                  {description}
                </p>
              )}
            </div>
          </div>

          {showCloseButton && (
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              aria-label={closeButtonAriaLabel}
              className="p-1.5 rounded-xl text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent hover:border-white/10 focus-visible:ring-2 focus-visible:ring-white focus:outline-none transition disabled:opacity-40 shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Modal Body */}
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}
