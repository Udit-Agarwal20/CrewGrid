import React, { useState, useRef, useEffect } from 'react';
import { UserPlus, Loader2 } from 'lucide-react';
import { Modal } from '../common/Modal';
import { useCreateJoinRequest } from '../../hooks/useRequests';
import { useToast } from '../../context/ToastContext';

interface JoinRequestModalProps {
  isOpen: boolean;
  teamId: string;
  teamName: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export function JoinRequestModal({
  isOpen,
  teamId,
  teamName,
  onClose,
  onSuccess
}: JoinRequestModalProps) {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const createRequestMutation = useCreateJoinRequest();
  const { success, error: toastError } = useToast();

  useEffect(() => {
    if (isOpen) {
      setMessage('');
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await createRequestMutation.mutateAsync({
        teamId,
        message: message.trim()
      });
      success('Join request sent!', 'The team leader has been notified of your request.');
      onSuccess?.();
      onClose();
    } catch (err: any) {
      toastError('Could not send join request', err.message || 'Submission failed');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Request to Join ${teamName}`}
      description="Introduce yourself to the team leader. Mention your relevant experience and how you can contribute."
      icon={<UserPlus className="w-4 h-4" />}
      maxWidth="max-w-md"
      isSubmitting={createRequestMutation.isPending}
      initialFocusRef={textareaRef}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="join-msg"
            className="block text-xs font-mono font-bold text-zinc-400 uppercase mb-1.5"
          >
            Message <span className="text-zinc-500 font-normal normal-case">(Optional)</span>
          </label>
          <textarea
            id="join-msg"
            ref={textareaRef}
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={500}
            placeholder="Hey, I specialize in full-stack TypeScript and would love to build Problem Statement 1 together!"
            className="w-full px-3.5 py-2.5 rounded-xl bg-[#18181C] border border-[#2C2826] hover:border-[#4E4A48] text-white text-xs focus:ring-2 focus:ring-white focus:outline-none transition resize-none placeholder-zinc-500"
          />
          <span className="text-[11px] font-mono text-zinc-500 block text-right mt-1">
            {message.length} / 500 characters
          </span>
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#2C2826]">
          <button
            type="button"
            onClick={onClose}
            disabled={createRequestMutation.isPending}
            className="px-4 py-2 rounded-full text-xs font-medium text-zinc-400 hover:text-white hover:bg-white/5 border border-[#2C2826] focus-visible:ring-2 focus-visible:ring-white focus:outline-none transition disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={createRequestMutation.isPending}
            className="px-5 py-2 rounded-full text-xs font-bold text-black bg-white hover:bg-zinc-200 focus-visible:ring-2 focus-visible:ring-white focus:outline-none transition-all duration-200 active:scale-95 flex items-center gap-1.5 disabled:opacity-50 shadow-md shadow-white/10"
          >
            {createRequestMutation.isPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Sending...
              </>
            ) : (
              'Submit Request'
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
