import { useState } from 'react';
import { Copy, Check, Clock, ShieldAlert, Loader2, Link2, Trash2 } from 'lucide-react';
import { Modal } from '../common/Modal';
import { useTeamInvites, useCreateInvite, useRevokeInvite } from '../../hooks/useInvites';
import { useToast } from '../../context/ToastContext';

interface InviteModalProps {
  isOpen: boolean;
  teamId: string;
  onClose: () => void;
}

export function InviteModal({ isOpen, teamId, onClose }: InviteModalProps) {
  const { data: invites = [], isLoading: loadingInvites } = useTeamInvites(teamId);
  const createInviteMutation = useCreateInvite();
  const revokeInviteMutation = useRevokeInvite();
  const { success, error: toastError } = useToast();

  const [expiresInHours, setExpiresInHours] = useState(24);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    try {
      const res = await createInviteMutation.mutateAsync({
        teamId,
        expiresInHours
      });

      if (res.token) {
        const fullUrl = `${window.location.origin}/invite#token=${res.token}`;
        setCreatedUrl(fullUrl);
        success('Invite created!', 'Copy the link now. The token is never shown again.');
      }
    } catch (err: any) {
      toastError('Cannot generate invite', err.message);
    }
  };

  const handleCopy = () => {
    if (createdUrl) {
      navigator.clipboard.writeText(createdUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      success('Copied to clipboard');
    }
  };

  const handleRevoke = async (inviteId: string) => {
    try {
      await revokeInviteMutation.mutateAsync({ teamId, inviteId });
      success('Invite revoked');
    } catch (err: any) {
      toastError('Cannot revoke invite', err.message);
    }
  };

  const isPending = createInviteMutation.isPending || revokeInviteMutation.isPending;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Team Invite Links"
      icon={<Link2 className="w-4 h-4" />}
      maxWidth="max-w-lg"
      isSubmitting={isPending}
    >
      <div>
        {/* Important Bearer Link Notice */}
        <div className="p-3.5 rounded-xl bg-[#222A42]/60 border border-[#35405A] text-xs text-[#B5C1D4] leading-relaxed mb-4">
          <strong className="text-[#9BF5CC]">Single-Use Team Links:</strong> Anyone with possession of the invite link can claim an open seat on your team immediately. Possession of the link—not a candidate selection—determines who joins. Share the link privately with your intended teammate.
        </div>

        {/* Generate New Invite Section */}
        <div className="p-4 rounded-xl bg-[#0B1020]/60 border border-[#35405A]">
          <h3 className="text-xs font-bold text-[#E9EDF5] uppercase tracking-wider mb-2 font-mono">
            Generate Single-Use Expiring Invite
          </h3>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mt-3">
            <div className="flex-1">
              <label htmlFor="invite-expiry" className="sr-only">
                Invite expiration window
              </label>
              <select
                id="invite-expiry"
                value={expiresInHours}
                onChange={(e) => setExpiresInHours(parseInt(e.target.value, 10))}
                className="w-full px-3 py-2 rounded-lg bg-[#171E31] border border-[#35405A] text-xs font-semibold text-[#E9EDF5] focus:ring-2 focus:ring-[#9BF5CC] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#9BF5CC]"
              >
                <option value={12}>Expires in 12 hours</option>
                <option value={24}>Expires in 24 hours</option>
                <option value={48}>Expires in 48 hours</option>
                <option value={72}>Expires in 72 hours</option>
              </select>
            </div>

            <button
              type="button"
              onClick={handleGenerate}
              disabled={createInviteMutation.isPending}
              className="px-4 py-2 rounded-lg bg-[#9BF5CC] text-[#0B1020] text-xs font-bold hover:bg-[#86e0b7] focus-visible:ring-2 focus-visible:ring-[#9BF5CC] focus:outline-none flex items-center justify-center gap-1.5 transition disabled:opacity-50 shadow-sm shrink-0"
            >
              {createInviteMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Link2 className="w-3.5 h-3.5" />
              )}
              Generate Link
            </button>
          </div>

          {/* Newly Generated URL Box */}
          {createdUrl && (
            <div className="mt-4 p-3.5 rounded-xl bg-[#0B1020] border border-[#9BF5CC]/40 animate-in fade-in duration-200">
              <div className="flex items-center gap-2 text-xs font-bold text-[#9BF5CC] mb-1.5">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>One-Time Invite URL Generated</span>
              </div>
              <p className="text-[11px] text-[#B5C1D4] mb-2 leading-relaxed">
                Copy this link now. The token is kept only in browser memory and cannot be recovered once you close this window.
              </p>
              <div className="flex items-center gap-2">
                <label htmlFor="generated-invite-url" className="sr-only">
                  Generated Invite URL
                </label>
                <input
                  id="generated-invite-url"
                  type="text"
                  readOnly
                  value={createdUrl}
                  className="flex-1 px-3 py-2 rounded-lg bg-[#171E31] border border-[#35405A] text-xs font-mono text-[#E9EDF5] select-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#9BF5CC]"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  aria-label={copied ? 'Copied invite link' : 'Copy invite link to clipboard'}
                  className="px-3 py-2 rounded-lg bg-[#9BF5CC] text-[#0B1020] text-xs font-bold hover:bg-[#86e0b7] focus-visible:ring-2 focus-visible:ring-[#9BF5CC] focus:outline-none flex items-center gap-1.5 transition shrink-0"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Existing Invites List */}
        <div className="mt-5">
          <h3 className="text-xs font-bold text-[#E9EDF5] uppercase tracking-wider mb-2 font-mono">
            Active & Past Invites
          </h3>

          {loadingInvites ? (
            <div className="p-4 text-center text-xs text-[#B5C1D4]">Loading invites...</div>
          ) : invites.length === 0 ? (
            <p className="text-xs text-[#B5C1D4]/70 italic p-3 rounded-lg bg-[#0B1020]/30 border border-[#35405A]/40">
              No previous invites found.
            </p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {invites.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between p-2.5 rounded-lg bg-[#0B1020]/40 border border-[#35405A] text-xs"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-[#E9EDF5] truncate max-w-[140px] sm:max-w-none">
                        ID: {inv.id}
                      </span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[10px] font-mono font-bold uppercase ${
                          inv.status === 'available'
                            ? 'bg-[#9BF5CC]/20 text-[#9BF5CC]'
                            : inv.status === 'used'
                            ? 'bg-[#222A42] text-[#B5C1D4]'
                            : 'bg-[#F87171]/20 text-[#F87171]'
                        }`}
                      >
                        {inv.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-[#B5C1D4] font-mono mt-0.5">
                      <Clock className="w-3 h-3" />
                      <span>Expires: {new Date(inv.expiresAt).toLocaleString()}</span>
                    </div>
                  </div>

                  {inv.status === 'available' && (
                    <button
                      type="button"
                      onClick={() => handleRevoke(inv.id)}
                      disabled={revokeInviteMutation.isPending}
                      className="p-1 rounded text-[#B5C1D4] hover:text-[#F87171] hover:bg-[#222A42] focus-visible:ring-2 focus-visible:ring-[#F87171] focus:outline-none transition"
                      title="Revoke this invite"
                      aria-label={`Revoke invite ${inv.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-5 pt-3 border-t border-[#35405A] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-[#222A42] hover:bg-[#35405A] border border-[#35405A] text-xs font-semibold text-[#E9EDF5] focus-visible:ring-2 focus-visible:ring-[#9BF5CC] focus:outline-none transition"
          >
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}
