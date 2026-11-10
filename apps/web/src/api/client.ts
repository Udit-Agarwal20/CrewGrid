import { ErrorEnvelope } from '@crewgrid/contracts';

let cachedCsrfToken: string | null = null;

export function setCsrfToken(token: string | null) {
  cachedCsrfToken = token;
}

export function getCsrfToken(): string | null {
  return cachedCsrfToken;
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
  options: RequestInit = {}
): Promise<{ data: T; meta: { requestId: string } }> {
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  // Include CSRF token on mutating requests if present
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(options.method || 'GET')) {
    if (cachedCsrfToken && !headers.has('X-CSRF-Token')) {
      headers.set('X-CSRF-Token', cachedCsrfToken);
    }
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
    credentials: 'include'
  });

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
      errorEnvelope.error.code,
      errorEnvelope.error.message,
      errorEnvelope.error.details,
      errorEnvelope.meta?.requestId || requestId
    );
  }

  if (response.status === 204) {
    return { data: undefined as unknown as T, meta: { requestId } };
  }

  return response.json();
}

