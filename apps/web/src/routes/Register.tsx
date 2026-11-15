import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Eye, EyeOff, Loader2, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export function Register() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { register, isAuthenticated } = useAuth();
  const { success, error: toastError } = useToast();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const rawReturnTo = searchParams.get('returnTo');
  const returnTo = rawReturnTo && rawReturnTo.startsWith('/') && !rawReturnTo.startsWith('//') ? rawReturnTo : '/onboarding';

  useEffect(() => {
    if (isAuthenticated) {
      navigate(returnTo, { replace: true });
    }
  }, [isAuthenticated, navigate, returnTo]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (password.length < 12) {
      setErrorMessage('Password must be at least 12 characters long.');
      return;
    }

    setIsSubmitting(true);

    try {
      await register({
        displayName: displayName.trim(),
        email: email.trim().toLowerCase(),
        password
      });
      success('Account created!', 'Let us set up your profile next.');
      navigate(returnTo, { replace: true });
    } catch (err: any) {
      const msg = err.message || 'Registration failed';
      setErrorMessage(msg);
      toastError('Registration error', msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#08080A] text-[#F4F4F5] flex items-center justify-center p-4 selection:bg-[#FF6B35] selection:text-[#08080A]">
      <div className="w-full max-w-md p-6 sm:p-8 rounded-2xl bg-[#111114] border border-[#2C2826] shadow-2xl">
        {/* Brand */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 font-black text-lg text-white mb-3">
            <span className="w-8 h-8 rounded-xl bg-white text-black font-display flex items-center justify-center text-sm shadow-sm">
              C
            </span>
            <span className="font-display font-bold">CrewGrid</span>
          </Link>
          <h1 className="font-display text-2xl font-bold text-white tracking-tight">Create your account</h1>
          <p className="text-xs text-zinc-400 mt-1">Join the race-proof hackathon matching platform</p>
        </div>

        {errorMessage && (
          <div role="alert" className="p-3.5 mb-5 rounded-xl bg-[#181113] border border-[#4A2027] text-xs text-[#F43F5E]">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="reg-name" className="block text-xs font-mono font-bold text-zinc-400 uppercase mb-1.5">
              Full / Display Name
            </label>
            <input
              id="reg-name"
              type="text"
              autoComplete="name"
              required
              minLength={2}
              maxLength={60}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Ada Lovelace"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#18181C] border border-[#2C2826] hover:border-[#4E4A48] text-sm text-white placeholder-zinc-500 focus:ring-2 focus:ring-white focus:outline-none transition-colors"
            />
          </div>

          <div>
            <label htmlFor="reg-email" className="block text-xs font-mono font-bold text-zinc-400 uppercase mb-1.5">
              Email Address
            </label>
            <input
              id="reg-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@domain.com"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#18181C] border border-[#2C2826] hover:border-[#4E4A48] text-sm text-white placeholder-zinc-500 focus:ring-2 focus:ring-white focus:outline-none transition-colors"
            />
          </div>

          <div>
            <label htmlFor="reg-password" className="block text-xs font-mono font-bold text-zinc-400 uppercase mb-1.5">
              Password (Min 12 characters)
            </label>
            <div className="relative">
              <input
                id="reg-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 12 characters"
                className="w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-[#18181C] border border-[#2C2826] hover:border-[#4E4A48] text-sm text-white placeholder-zinc-500 focus:ring-2 focus:ring-white focus:outline-none transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-zinc-400 hover:text-white transition flex items-center justify-center min-w-[24px] min-h-[24px]"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-2 py-3 px-4 rounded-full bg-white hover:bg-zinc-200 text-black font-bold text-sm flex items-center justify-center gap-2 transition-all duration-200 active:scale-95 disabled:opacity-50 shadow-md shadow-white/10"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            Create Account
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-[#2C2826] text-center text-xs text-zinc-400">
          Already have an account?{' '}
          <Link to={`/login${rawReturnTo ? `?returnTo=${encodeURIComponent(rawReturnTo)}` : ''}`} className="text-white font-semibold hover:underline">
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
