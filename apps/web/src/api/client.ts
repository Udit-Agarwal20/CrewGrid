import { ErrorEnvelope } from '@crewgrid/contracts';

let cachedCsrfToken: string | null = null;

export function setCsrfToken(token: string | null) {
  cachedCsrfToken = token;
}

export function getCsrfToken(): string | null {
  return cachedCsrfToken;
}

export function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'idemp_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export async function refreshCsrfToken(): Promise<string | null> {
  try {
    const res = await fetch('/api/v1/auth/csrf', {
      credentials: 'include'
    });
    if (res.ok) {
      const json = await res.json();
      const token = json?.data?.csrfToken || null;
      setCsrfToken(token);
      return token;
    }
  } catch {
    // Ignore fetch error if unauthenticated
  }
  return null;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
    public readonly requestId?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit & { idempotencyKey?: string } = {}
): Promise<{ data: T; meta: { requestId: string; nextCursor?: string | null; hasMore?: boolean } }> {
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  // Include Idempotency-Key if provided
  if (options.idempotencyKey && !headers.has('Idempotency-Key')) {
    headers.set('Idempotency-Key', options.idempotencyKey);
  }

  // Include CSRF token on mutating requests if present
  const isMutating = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(options.method || 'GET');
  if (isMutating) {
    if (!cachedCsrfToken) {
      await refreshCsrfToken();
    }
    if (cachedCsrfToken && !headers.has('X-CSRF-Token')) {
      headers.set('X-CSRF-Token', cachedCsrfToken);
    }
  }

  let response = await fetch(endpoint, {
    ...options,
    headers,
    credentials: 'include'
  });

  // If CSRF expired or rejected, refresh token once and retry mutating request
  if (response.status === 403 && isMutating) {
    const newToken = await refreshCsrfToken();
    if (newToken) {
      headers.set('X-CSRF-Token', newToken);
      response = await fetch(endpoint, {
        ...options,
        headers,
        credentials: 'include'
      });
    }
  }

  const requestId = response.headers.get('X-Request-Id') || 'unknown';

  if (!response.ok) {
    let errorEnvelope: ErrorEnvelope;
    try {
      errorEnvelope = await response.json();
    } catch {
      throw new ApiError(
        response.status,
        'INTERNAL_ERROR',
        `HTTP ${response.status} ${response.statusText}`,
        undefined,
        requestId
      );
    }

    throw new ApiError(
      response.status,
      errorEnvelope.error?.code || 'UNKNOWN_ERROR',
      errorEnvelope.error?.message || `HTTP ${response.status}`,
      errorEnvelope.error?.details,
      errorEnvelope.meta?.requestId || requestId
    );
  }

  if (response.status === 204) {
    return { data: undefined as unknown as T, meta: { requestId } };
  }

  return response.json();
}
