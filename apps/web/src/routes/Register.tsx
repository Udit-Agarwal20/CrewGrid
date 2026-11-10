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
      navigate('/app', { replace: true });
    }
  }, [isAuthenticated, navigate]);

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
    <div className="min-h-screen bg-[#0B1020] text-[#E9EDF5] flex items-center justify-center p-4">
      <div className="w-full max-w-md p-6 sm:p-8 rounded-2xl bg-[#171E31] border border-[#35405A] shadow-2xl">
        {/* Brand */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 font-black text-lg text-[#E9EDF5] mb-3">
            <span className="w-7 h-7 rounded-lg bg-[#9BF5CC] flex items-center justify-center text-[#0B1020] text-sm">
              C
            </span>
            <span>CrewGrid</span>
          </Link>
          <h1 className="text-2xl font-bold text-[#E9EDF5]">Create your account</h1>
          <p className="text-xs text-[#B5C1D4] mt-1">Join the race-proof hackathon matching platform</p>
        </div>

        {errorMessage && (
          <div role="alert" className="p-3.5 mb-5 rounded-xl bg-[#F87171]/15 border border-[#F87171]/30 text-xs text-[#F87171]">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="reg-name" className="block text-xs font-semibold text-[#E9EDF5] mb-1.5">
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
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#222A42] border border-[#35405A] text-sm text-[#E9EDF5] placeholder-[#B5C1D4]/40 focus:ring-2 focus:ring-[#9BF5CC] focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="reg-email" className="block text-xs font-semibold text-[#E9EDF5] mb-1.5">
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
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#222A42] border border-[#35405A] text-sm text-[#E9EDF5] placeholder-[#B5C1D4]/40 focus:ring-2 focus:ring-[#9BF5CC] focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="reg-password" className="block text-xs font-semibold text-[#E9EDF5] mb-1.5">
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
                className="w-full pl-3.5 pr-10 py-2.5 rounded-lg bg-[#222A42] border border-[#35405A] text-sm text-[#E9EDF5] placeholder-[#B5C1D4]/40 focus:ring-2 focus:ring-[#9BF5CC] focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#B5C1D4] hover:text-[#E9EDF5] transition"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-2 py-2.5 px-4 rounded-xl bg-[#9BF5CC] text-[#0B1020] font-bold text-sm hover:bg-[#86e0b7] flex items-center justify-center gap-2 transition disabled:opacity-50 shadow-md shadow-[#9BF5CC]/15"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            Create Account
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-[#35405A] text-center text-xs text-[#B5C1D4]">
          Already have an account?{' '}
          <Link to={`/login${rawReturnTo ? `?returnTo=${encodeURIComponent(rawReturnTo)}` : ''}`} className="text-[#9BF5CC] font-semibold hover:underline">
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
