import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router';
import {
  Users,
  ShieldCheck,
  AlertCircle,
  Loader2,
  Lock,
  LogIn,
  UserPlus
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useRedeemInvite } from '../hooks/useInvites';

export function InviteRedeem() {
  const navigate = useNavigate();
  const { user, login, register, isAuthenticated, isLoading: authLoading } = useAuth();
  const { success, error: toastError } = useToast();
  const redeemMutation = useRedeemInvite();

  // Transient in-memory token extracted from URL fragment
  const [token, setToken] = useState<string | null>(null);
  const [noTokenFound, setNoTokenFound] = useState(false);

  // In-page auth state for unauthenticated users
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);

  // Error banner for redemption failure
  const [redeemError, setRedeemError] = useState<string | null>(null);

  useEffect(() => {
    // Extract token from fragment (#token=XYZ)
    const hash = window.location.hash.replace(/^#/, '');
    const params = new URLSearchParams(hash);
    const fragmentToken = params.get('token') || (hash.startsWith('token=') ? hash.slice(6) : null);

    if (fragmentToken && fragmentToken.length > 5) {
      setToken(fragmentToken);
      // SCRUB URL: Immediately strip the token from URL bar and history
      window.history.replaceState(null, '', window.location.pathname);
    } else {
      setNoTokenFound(true);
    }
  }, []);

  const handleRedeem = async () => {
    if (!token) return;
    setRedeemError(null);

    try {
      const team = await redeemMutation.mutateAsync({ token });
      success('Welcome to the team!', `You have joined ${team.name}.`);
      navigate(`/app/teams/${team.id}`);
    } catch (err: any) {
      const code = err.code || '';
      let message = err.message || 'Failed to redeem invite.';
      if (code === 'TEAM_FULL') {
        message = 'This team is already at maximum capacity. No seats are remaining.';
      } else if (code === 'INVITE_EXPIRED') {
        message = 'This invite link has expired or has already been used.';
      } else if (code === 'ALREADY_IN_TEAM') {
        message = 'You are already a member of a team in this hackathon. You must leave your current team first.';
      } else if (code === 'INVITE_REVOKED') {
        message = 'This invite link has been revoked by the team leader.';
      }
      setRedeemError(message);
      toastError('Could not join team', message);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSubmitting(true);

    try {
      if (authMode === 'login') {
        await login({ email, password });
        success('Logged in successfully', 'You can now join the team.');
      } else {
        await register({ email, password, displayName });
        success('Account created!', 'You are now ready to join the team.');
      }
    } catch (err: any) {
      setAuthError(err.message || 'Authentication failed');
    } finally {
      setAuthSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0B1020] flex items-center justify-center p-4">
        <Loader2 className="w-8 h-8 text-[#9BF5CC] animate-spin" />
      </div>
    );
  }

  if (noTokenFound) {
    return (
      <div className="min-h-screen bg-[#0B1020] text-[#E9EDF5] flex items-center justify-center p-4">
        <div className="w-full max-w-md p-8 rounded-2xl bg-[#171E31] border border-[#35405A] shadow-2xl text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-[#FBBF24] mx-auto" />
          <h1 className="text-xl font-bold">Invalid or Missing Invite Link</h1>
          <p className="text-xs text-[#B5C1D4] leading-relaxed">
            CrewGrid team invites require a secure fragment token (e.g.{' '}
            <code className="text-[#9BF5CC]">/invite#token=...</code>). Make sure you clicked the complete invite link provided by your team leader.
          </p>
          <div className="pt-2">
            <Link
              to="/app"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-[#0B1020] bg-[#9BF5CC] hover:bg-[#86E4BA] transition"
            >
              Go to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B1020] text-[#E9EDF5] flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#171E31] border border-[#35405A] text-xs font-mono text-[#9BF5CC]">
            <ShieldCheck className="w-3.5 h-3.5" />
            Secure One-Time Invite
          </div>
          <h1 className="text-2xl font-black tracking-tight">Join Your Hackathon Crew</h1>
          <p className="text-xs text-[#B5C1D4]">
            You have received an invitation to join a team on CrewGrid.
          </p>
        </div>

        {/* Card Body */}
        <div className="p-6 md:p-8 rounded-2xl bg-[#171E31] border border-[#35405A] shadow-2xl space-y-6">
          {redeemError && (
            <div className="p-3.5 rounded-xl bg-[#F87171]/10 border border-[#F87171]/30 flex items-start gap-2.5 text-xs text-[#F87171]">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{redeemError}</span>
            </div>
          )}

          {isAuthenticated ? (
            /* Authenticated Flow: Confirm Join */
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-[#222A42]/60 border border-[#35405A] space-y-2">
                <div className="text-xs font-mono text-[#B5C1D4]">Joining as:</div>
                <div className="text-sm font-bold text-[#E9EDF5] flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-[#9BF5CC]/20 text-[#9BF5CC] font-mono text-xs flex items-center justify-center font-bold">
                    {user?.displayName?.[0] || 'U'}
                  </div>
                  <span>{user?.displayName}</span>
                  {user?.handle && <span className="text-xs text-[#9BF5CC]">(@{user.handle})</span>}
                </div>
              </div>

              <div className="text-xs text-[#B5C1D4] leading-relaxed">
                By accepting this invitation, you will immediately become an active member of the team.
                Any pending join requests you sent to other teams will be automatically canceled.
              </div>

              <button
                type="button"
                disabled={redeemMutation.isPending || !token}
                onClick={handleRedeem}
                className="w-full py-3 rounded-xl text-sm font-bold text-[#0B1020] bg-[#9BF5CC] hover:bg-[#86E4BA] transition flex items-center justify-center gap-2 disabled:opacity-50 shadow-lg"
              >
                {redeemMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Adding you to team...
                  </>
                ) : (
                  <>
                    <Users className="w-4 h-4" />
                    Accept Invite & Join Team
                  </>
                )}
              </button>
            </div>
          ) : (
            /* Unauthenticated Flow: Inline Login/Register without losing token */
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-[#222A42]/60 border border-[#35405A] text-xs text-[#B5C1D4] flex items-center gap-2">
                <Lock className="w-4 h-4 text-[#9BF5CC] shrink-0" />
                <span>Please sign in or create an account to accept this invite. Your invite token is securely held in memory.</span>
              </div>

              {/* Toggle Login / Register */}
              <div className="grid grid-cols-2 p-1 rounded-xl bg-[#0B1020] border border-[#35405A] text-xs font-bold">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('login');
                    setAuthError(null);
                  }}
                  className={`py-2 rounded-lg transition ${
                    authMode === 'login'
                      ? 'bg-[#171E31] text-[#9BF5CC] shadow-sm'
                      : 'text-[#B5C1D4] hover:text-[#E9EDF5]'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('register');
                    setAuthError(null);
                  }}
                  className={`py-2 rounded-lg transition ${
                    authMode === 'register'
                      ? 'bg-[#171E31] text-[#9BF5CC] shadow-sm'
                      : 'text-[#B5C1D4] hover:text-[#E9EDF5]'
                  }`}
                >
                  Create Account
                </button>
              </div>

              {authError && (
                <div className="p-3 rounded-xl bg-[#F87171]/10 border border-[#F87171]/30 text-xs text-[#F87171]">
                  {authError}
                </div>
              )}

              <form onSubmit={handleAuthSubmit} className="space-y-3 pt-1">
                {authMode === 'register' && (
                  <div>
                    <label className="block text-xs font-mono font-bold text-[#B5C1D4] uppercase mb-1">
                      Full Name
                    </label>
                    <input
                      type="text"
                      required
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl bg-[#0B1020] border border-[#35405A] text-xs text-[#E9EDF5] focus:outline-none focus:border-[#9BF5CC]"
                      placeholder="Ada Lovelace"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-mono font-bold text-[#B5C1D4] uppercase mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-[#0B1020] border border-[#35405A] text-xs text-[#E9EDF5] focus:outline-none focus:border-[#9BF5CC]"
                    placeholder="user@example.com"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono font-bold text-[#B5C1D4] uppercase mb-1">
                    Password {authMode === 'register' && <span className="text-[#B5C1D4]/60">(min 12 chars)</span>}
                  </label>
                  <input
                    type="password"
                    required
                    minLength={authMode === 'register' ? 12 : undefined}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-[#0B1020] border border-[#35405A] text-xs text-[#E9EDF5] focus:outline-none focus:border-[#9BF5CC]"
                    placeholder="••••••••••••"
                  />
                </div>

                <button
                  type="submit"
                  disabled={authSubmitting}
                  className="w-full mt-2 py-2.5 rounded-xl text-xs font-bold text-[#0B1020] bg-[#9BF5CC] hover:bg-[#86E4BA] transition flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {authSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : authMode === 'login' ? (
                    <>
                      <LogIn className="w-3.5 h-3.5" />
                      Sign In & Continue
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-3.5 h-3.5" />
                      Register & Continue
                    </>
                  )}
                </button>
              </form>
            </div>
          )}
        </div>

        <div className="text-center">
          <Link to="/" className="text-xs text-[#B5C1D4] hover:text-[#9BF5CC] transition">
            CrewGrid — Problem Statement 1
          </Link>
        </div>
      </div>
    </div>
  );
}
