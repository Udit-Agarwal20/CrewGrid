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
        <div className="p-3.5 rounded-xl bg-[#18181C] border border-[#2C2826] text-xs text-zinc-300 leading-relaxed mb-4">
          <strong className="text-white font-display">Single-Use Team Links:</strong> Anyone with possession of the invite link can claim an open seat on your team immediately. Possession of the link—not a candidate selection—determines who joins. Share the link privately with your intended teammate.
        </div>

        {/* Generate New Invite Section */}
        <div className="p-4 rounded-xl bg-[#18181C] border border-[#2C2826]">
          <h3 className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-wider mb-2">
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
                className="w-full px-3 py-2.5 rounded-xl bg-[#111114] border border-[#2C2826] hover:border-[#4E4A48] text-xs font-semibold text-white focus:ring-2 focus:ring-white focus:outline-none transition-colors"
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
              className="px-5 py-2.5 rounded-full bg-white text-black text-xs font-bold hover:bg-zinc-200 focus-visible:ring-2 focus-visible:ring-white focus:outline-none flex items-center justify-center gap-1.5 transition-all duration-200 active:scale-95 disabled:opacity-50 shadow-md shadow-white/10 shrink-0"
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
            <div className="mt-4 p-3.5 rounded-xl bg-[#111114] border border-[#FF6B35]/50 animate-in fade-in duration-200">
              <div className="flex items-center gap-2 text-xs font-bold text-[#FF7A45] mb-1.5 font-display">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>One-Time Invite URL Generated</span>
              </div>
              <p className="text-[11px] text-zinc-400 mb-2 leading-relaxed">
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
                  className="flex-1 px-3 py-2 rounded-lg bg-[#18181C] border border-[#2C2826] text-xs font-mono text-white select-all focus:outline-none focus:ring-2 focus:ring-white"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  aria-label={copied ? 'Copied invite link' : 'Copy invite link to clipboard'}
                  className="px-4 py-2 rounded-full bg-white text-black text-xs font-bold hover:bg-zinc-200 focus-visible:ring-2 focus-visible:ring-white focus:outline-none flex items-center gap-1.5 transition shrink-0"
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
          <h3 className="text-xs font-mono font-bold text-zinc-400 uppercase tracking-wider mb-2">
            Active & Past Invites
          </h3>

          {loadingInvites ? (
            <div className="p-4 text-center text-xs text-zinc-400">Loading invites...</div>
          ) : invites.length === 0 ? (
            <p className="text-xs text-zinc-500 italic p-3 rounded-xl bg-[#18181C] border border-[#2C2826]">
              No previous invites found.
            </p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {invites.map((inv) => (
                <div
                  key={inv.id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-[#18181C] border border-[#2C2826] text-xs"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-zinc-300 truncate max-w-[140px] sm:max-w-none">
                        ID: {inv.id}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
                          inv.status === 'available'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : inv.status === 'used'
                            ? 'bg-white/5 text-zinc-400 border border-white/10'
                            : 'bg-rose-500/10 text-[#F43F5E] border border-rose-500/20'
                        }`}
                      >
                        {inv.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 font-mono mt-0.5">
                      <Clock className="w-3 h-3" />
                      <span>Expires: {new Date(inv.expiresAt).toLocaleString()}</span>
                    </div>
                  </div>

                  {inv.status === 'available' && (
                    <button
                      type="button"
                      onClick={() => handleRevoke(inv.id)}
                      disabled={revokeInviteMutation.isPending}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-[#F43F5E] hover:bg-[#181113] focus-visible:ring-2 focus-visible:ring-[#F43F5E] focus:outline-none transition"
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

        <div className="mt-5 pt-3 border-t border-[#2C2826] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-full bg-white/5 hover:bg-white/10 border border-[#2C2826] text-xs font-semibold text-white focus-visible:ring-2 focus-visible:ring-white focus:outline-none transition"
          >
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}
