import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { apiFetch, ApiError } from '../api/client';
import { PublicUser } from '@crewgrid/contracts';

export function Register() {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await apiFetch<PublicUser>('/api/v1/auth/register', {
        method: 'POST',
        body: JSON.stringify({ displayName, email, password })
      });

      // After registration, redirect to login
      navigate('/login');
    } catch (err: any) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Registration failed. Please check your network connection.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto py-16 px-4">
      <div className="bg-[#171E31] border border-[#35405A] rounded-2xl p-8 shadow-xl">
        <h1 className="text-2xl font-bold text-[#E9EDF5] mb-2">Create Account</h1>
        <p className="text-sm text-[#B5C1D4] mb-6">Join CrewGrid for Hack4Hack 2026</p>

        {error && (
          <div role="alert" className="mb-6 p-3 rounded-lg bg-red-950/60 border border-red-500/50 text-red-200 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-[#B5C1D4] mb-1.5" htmlFor="displayName">
              Display Name
            </label>
            <input
              id="displayName"
              type="text"
              required
              minLength={2}
              maxLength={60}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#222A42] border border-[#35405A] text-[#E9EDF5] focus:outline-none focus:ring-2 focus:ring-[#9BF5CC]"
              placeholder="Alex Smith"
            />
          </div>

          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-[#B5C1D4] mb-1.5" htmlFor="email">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#222A42] border border-[#35405A] text-[#E9EDF5] focus:outline-none focus:ring-2 focus:ring-[#9BF5CC]"
              placeholder="alex@example.com"
              autoComplete="email"
            />
          </div>

          <div>
            <label className="block text-xs font-medium uppercase tracking-wider text-[#B5C1D4] mb-1.5" htmlFor="password">
              Password (min 12 characters)
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={12}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#222A42] border border-[#35405A] text-[#E9EDF5] focus:outline-none focus:ring-2 focus:ring-[#9BF5CC]"
              autoComplete="new-password"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-lg bg-[#9BF5CC] text-[#0B1020] font-semibold hover:bg-[#86e0b7] transition disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[#9BF5CC]"
          >
            {loading ? 'Creating account...' : 'Register'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[#B5C1D4]">
          Already have an account?{' '}
          <Link to="/login" className="text-[#9BF5CC] hover:underline">
            Sign In
          </Link>
        </p>
      </div>
    </div>
  );
}

