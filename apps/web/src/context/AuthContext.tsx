import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { PublicUser, LoginRequest, RegisterRequest, LoginResponse } from '@crewgrid/contracts';
import { apiFetch, refreshCsrfToken, setCsrfToken, ApiError } from '../api/client';

interface AuthContextValue {
  user: PublicUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (data: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<PublicUser | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async (): Promise<PublicUser | null> => {
    try {
      const res = await apiFetch<PublicUser>('/api/v1/auth/me');
      setUser(res.data);
      await refreshCsrfToken();
      return res.data;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
        setCsrfToken(null);
      }
      return null;
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        await refreshUser();
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [refreshUser]);

  const login = useCallback(
    async (data: LoginRequest) => {
      const res = await apiFetch<LoginResponse>('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify(data)
      });
      setUser(res.data.user);
      setCsrfToken(res.data.csrfToken);
    },
    []
  );

  const register = useCallback(
    async (data: RegisterRequest) => {
      await apiFetch<PublicUser>('/api/v1/auth/register', {
        method: 'POST',
        body: JSON.stringify(data)
      });
      // After registration, auto-login with credentials
      const loginRes = await apiFetch<LoginResponse>('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: data.email, password: data.password })
      });
      setUser(loginRes.data.user);
      setCsrfToken(loginRes.data.csrfToken);
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await apiFetch('/api/v1/auth/logout', { method: 'POST' });
    } finally {
      setUser(null);
      setCsrfToken(null);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        logout,
        refreshUser
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}

