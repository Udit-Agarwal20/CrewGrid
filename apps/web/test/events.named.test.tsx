import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEvents, SUPPORTED_SSE_EVENTS } from '../src/hooks/useEvents';
import { RealtimeEventEnvelope } from '@crewgrid/contracts';

// Mock EventSource implementation that supports addEventListener / dispatchEvent
class MockEventSource {
  public url: string;
  public withCredentials?: boolean;
  public readyState: number = 0; // CONNECTING
  public onopen: ((e: Event) => void) | null = null;
  public onmessage: ((e: MessageEvent) => void) | null = null;
  public onerror: ((e: Event) => void) | null = null;
  private listeners: Map<string, Set<EventListener>> = new Map();

  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;

  constructor(url: string, eventSourceInitDict?: EventSourceInit) {
    this.url = url;
    this.withCredentials = eventSourceInitDict?.withCredentials;
    MockEventSource.instances.push(this);

    // Simulate async open
    setTimeout(() => {
      act(() => {
        this.readyState = MockEventSource.OPEN;
        if (this.onopen) {
          this.onopen(new Event('open'));
        }
      });
    }, 10);
  }

  static instances: MockEventSource[] = [];

  addEventListener(type: string, listener: EventListener) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: EventListener) {
    const set = this.listeners.get(type);
    if (set) {
      set.delete(listener);
    }
  }

  dispatchEvent(event: Event): boolean {
    const listeners = this.listeners.get(event.type);
    if (listeners) {
      for (const listener of listeners) {
        listener(event);
      }
    }
    if (event.type === 'message' && this.onmessage) {
      this.onmessage(event as MessageEvent);
    }
    return true;
  }

  close() {
    this.readyState = MockEventSource.CLOSED;
  }
}

describe('useEvents Named-Event Handling Tests (Issue 2)', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    MockEventSource.instances = [];
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } }
    });
    // Replace global EventSource
    (globalThis as any).EventSource = MockEventSource;
  });

  const createWrapper = () => {
    return ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };

  it('exports all supported server event types', () => {
    expect(SUPPORTED_SSE_EVENTS).toContain('team.created');
    expect(SUPPORTED_SSE_EVENTS).toContain('team.updated');
    expect(SUPPORTED_SSE_EVENTS).toContain('team.deleted');
    expect(SUPPORTED_SSE_EVENTS).toContain('member.joined');
    expect(SUPPORTED_SSE_EVENTS).toContain('member.left');
    expect(SUPPORTED_SSE_EVENTS).toContain('request.created');
    expect(SUPPORTED_SSE_EVENTS).toContain('request.resolved');
    expect(SUPPORTED_SSE_EVENTS).toContain('leader.transferred');
  });

  it('connects and receives named SSE event "team.created", updating lastActivity and invalidating team queries', async () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const hackathonId = '650c00000000000000000001';
    const teamId = '650c00000000000000000099';

    const { result } = renderHook(() => useEvents(hackathonId), {
      wrapper: createWrapper()
    });

    // Wait for connection to open
    await vi.waitFor(() => {
      expect(result.current.status).toBe('connected');
    });

    const es = MockEventSource.instances[0];
    expect(es).toBeDefined();

    const mockPayload: RealtimeEventEnvelope = {
      eventId: '650c00000000000000000010',
      eventType: 'team.created',
      hackathonId,
      teamId,
      userId: null,
      scope: 'public-hackathon',
      occurredAt: new Date().toISOString(),
      payload: { name: 'Alpha Squad', memberCount: 1 }
    };

    // Dispatch custom named event (mimicking server SSE: event: team.created)
    act(() => {
      const customEvent = new MessageEvent('team.created', {
        data: JSON.stringify(mockPayload)
      });
      es.dispatchEvent(customEvent);
    });

    expect(result.current.lastActivity).not.toBeNull();

    // Verify query invalidation occurred for hackathon teams and specific team
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['teams', hackathonId] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['my-team', hackathonId] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['team', teamId] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['team-members', teamId] });
  });

  it('receives named SSE event "member.joined" and invalidates member and request queries', async () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const hackathonId = '650c00000000000000000002';
    const teamId = '650c00000000000000000088';

    const { result } = renderHook(() => useEvents(hackathonId), {
      wrapper: createWrapper()
    });

    await vi.waitFor(() => {
      expect(result.current.status).toBe('connected');
    });

    const es = MockEventSource.instances[0];

    const mockPayload: RealtimeEventEnvelope = {
      eventId: '650c00000000000000000011',
      eventType: 'member.joined',
      hackathonId,
      teamId,
      userId: '650c00000000000000000077',
      scope: 'team',
      occurredAt: new Date().toISOString(),
      payload: { memberCount: 2 }
    };

    act(() => {
      const customEvent = new MessageEvent('member.joined', {
        data: JSON.stringify(mockPayload)
      });
      es.dispatchEvent(customEvent);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['team', teamId] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['team-members', teamId] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['team-requests', teamId] });
  });

  it('cleans up event listeners and closes connection on unmount', async () => {
    const hackathonId = '650c00000000000000000003';

    const { result, unmount } = renderHook(() => useEvents(hackathonId), {
      wrapper: createWrapper()
    });

    await vi.waitFor(() => {
      expect(result.current.status).toBe('connected');
    });

    const es = MockEventSource.instances[0];
    expect(es.readyState).toBe(MockEventSource.OPEN);

    unmount();

    expect(es.readyState).toBe(MockEventSource.CLOSED);
  });
});
