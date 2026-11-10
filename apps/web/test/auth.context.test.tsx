import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { getCsrfToken, setCsrfToken } from '../src/api/client';

describe('AuthContext Integration Tests (Issue 1)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setCsrfToken(null);
  });

  it('restores session when GET /api/v1/auth/me succeeds', async () => {
    const mockUser = {
      id: '507f1f77bcf86cd799439011',
      displayName: 'Alice Developer',
      skills: ['react', 'node'],
      discoverable: false
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/v1/auth/me')) {
        return new Response(
          JSON.stringify({
            data: mockUser,
            meta: { requestId: 'req_test_1' }
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('/api/v1/auth/csrf')) {
        return new Response(
          JSON.stringify({
            data: { csrfToken: 'csrf_mock_token_123' },
            meta: { requestId: 'req_test_2' }
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('Not found', { status: 404 });
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toEqual(mockUser);
    expect(result.current.user?.displayName).toBe('Alice Developer');
    expect(getCsrfToken()).toBe('csrf_mock_token_123');
  });

  it('correctly handles login response { user, csrfToken } and sets both user and CSRF state', async () => {
    const mockUser = {
      id: '507f1f77bcf86cd799439022',
      displayName: 'Bob Leader',
      skills: ['typescript'],
      discoverable: true
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      // Unauthenticated initial me check
      if (url.includes('/api/v1/auth/me')) {
        return new Response(
          JSON.stringify({
            error: { code: 'UNAUTHENTICATED', message: 'Not logged in' },
            meta: { requestId: 'req_unauth' }
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }
      // Login POST
      if (url.includes('/api/v1/auth/login')) {
        return new Response(
          JSON.stringify({
            data: {
              user: mockUser,
              csrfToken: 'csrf_from_login_post_999'
            },
            meta: { requestId: 'req_login' }
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('Not found', { status: 404 });
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();

    // Trigger login
    await act(async () => {
      await result.current.login({
        email: 'bob@example.com',
        password: 'Password123456!'
      });
    });

    // Check user is assigned directly, NOT nested under user.user
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).not.toBeNull();
    expect(result.current.user?.id).toBe('507f1f77bcf86cd799439022');
    expect(result.current.user?.displayName).toBe('Bob Leader');
    expect(getCsrfToken()).toBe('csrf_from_login_post_999');
  });

  it('correctly handles registration auto-login and primes CSRF token', async () => {
    const mockUser = {
      id: '507f1f77bcf86cd799439033',
      displayName: 'Carol Engineer',
      skills: [],
      discoverable: false
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/v1/auth/me')) {
        return new Response(
          JSON.stringify({
            error: { code: 'UNAUTHENTICATED', message: 'Not logged in' },
            meta: { requestId: 'req_unauth' }
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('/api/v1/auth/register')) {
        return new Response(
          JSON.stringify({
            data: mockUser,
            meta: { requestId: 'req_reg' }
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('/api/v1/auth/login')) {
        return new Response(
          JSON.stringify({
            data: {
              user: mockUser,
              csrfToken: 'csrf_after_reg_456'
            },
            meta: { requestId: 'req_login' }
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('Not found', { status: 404 });
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.register({
        email: 'carol@example.com',
        password: 'Password1234567!',
        displayName: 'Carol Engineer'
      });
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.displayName).toBe('Carol Engineer');
    expect(getCsrfToken()).toBe('csrf_after_reg_456');
  });

  it('clears user state and CSRF token on logout', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/v1/auth/logout')) {
        return new Response(null, { status: 204 });
      }
      if (url.includes('/api/v1/auth/me')) {
        return new Response(
          JSON.stringify({
            data: { id: 'user_1', displayName: 'User', skills: [], discoverable: false },
            meta: { requestId: '1' }
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response('Not found', { status: 404 });
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AuthProvider>{children}</AuthProvider>
    );

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.isAuthenticated).toBe(true);

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(getCsrfToken()).toBeNull();
  });
});

