import { useEffect, useState, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RealtimeEventEnvelope, RealtimeEventType } from '@crewgrid/contracts';
import { isValidObjectId } from '../utils/validation';

export type ConnectionState = 'connected' | 'connecting' | 'disconnected';

export const SUPPORTED_SSE_EVENTS: RealtimeEventType[] = [
  'team.created',
  'team.updated',
  'team.deleted',
  'member.joined',
  'member.left',
  'request.created',
  'request.resolved',
  'leader.transferred'
];

const MAX_RECONNECT_ATTEMPTS = 5;

export function useEvents(hackathonId: string | undefined) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ConnectionState>('disconnected');
  const [lastActivity, setLastActivity] = useState<Date | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<any>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const lastEventIdRef = useRef<string | null>(null);

  const invalidateQueriesForEvent = useCallback(
    (event: RealtimeEventEnvelope) => {
      const { teamId } = event;

      // Invalidate hackathon team lists
      queryClient.invalidateQueries({ queryKey: ['teams', hackathonId] });
      queryClient.invalidateQueries({ queryKey: ['my-team', hackathonId] });
      queryClient.invalidateQueries({ queryKey: ['teammates', hackathonId] });
      queryClient.invalidateQueries({ queryKey: ['my-requests'] });

      // Invalidate specific team queries
      if (teamId) {
        queryClient.invalidateQueries({ queryKey: ['team', teamId] });
        queryClient.invalidateQueries({ queryKey: ['team-members', teamId] });
        queryClient.invalidateQueries({ queryKey: ['team-requests', teamId] });
        queryClient.invalidateQueries({ queryKey: ['team-invites', teamId] });
        queryClient.invalidateQueries({ queryKey: ['team-audit', teamId] });
        queryClient.invalidateQueries({ queryKey: ['team-suggestions', teamId] });
      }
    },
    [queryClient, hackathonId]
  );

  useEffect(() => {
    // Validate hackathonId before establishing any connection
    if (!isValidObjectId(hackathonId)) {
      setStatus('disconnected');
      return;
    }

    let isCancelled = false;
    let currentEs: EventSource | null = null;
    reconnectAttemptsRef.current = 0;

    const handleEvent = (messageEvent: MessageEvent) => {
      if (isCancelled) return;
      if (messageEvent.lastEventId) {
        lastEventIdRef.current = messageEvent.lastEventId;
      }
      try {
        const envelope: RealtimeEventEnvelope = JSON.parse(messageEvent.data);
        if (envelope.eventId) {
          lastEventIdRef.current = envelope.eventId;
        }
        setLastActivity(new Date());
        invalidateQueriesForEvent(envelope);
      } catch {
        // Ignore heartbeat comments or non-json keep-alive
      }
    };

    const handleSyncGap = (messageEvent: MessageEvent) => {
      if (isCancelled) return;
      if (messageEvent.lastEventId) {
        lastEventIdRef.current = messageEvent.lastEventId;
      }
      setLastActivity(new Date());
      // Re-sync all query cache to authoritative backend state on gap detection
      queryClient.invalidateQueries();
    };

    function cleanupListeners(es: EventSource) {
      es.onopen = null;
      es.onmessage = null;
      es.onerror = null;
      for (const eventName of SUPPORTED_SSE_EVENTS) {
        es.removeEventListener(eventName, handleEvent as EventListener);
      }
      es.removeEventListener('sync.gap', handleSyncGap as EventListener);
    }

    function connect() {
      if (currentEs) {
        cleanupListeners(currentEs);
        currentEs.close();
      }

      setStatus('connecting');

      let url = `/api/v1/hackathons/${hackathonId}/events`;
      if (lastEventIdRef.current) {
        url += `?lastEventId=${encodeURIComponent(lastEventIdRef.current)}`;
      }
      const es = new EventSource(url, { withCredentials: true });
      currentEs = es;
      eventSourceRef.current = es;

      es.onopen = () => {
        if (!isCancelled) {
          setStatus('connected');
          setLastActivity(new Date());
          reconnectAttemptsRef.current = 0;
        }
      };

      // Handle standard message events
      es.onmessage = handleEvent;

      // Register listeners for all server-named SSE event types
      for (const eventName of SUPPORTED_SSE_EVENTS) {
        es.addEventListener(eventName, handleEvent as EventListener);
      }
      es.addEventListener('sync.gap', handleSyncGap as EventListener);

      es.onerror = async () => {
        if (isCancelled) return;
        setStatus('disconnected');
        cleanupListeners(es);
        es.close();

        // Check if error was a non-retryable 4xx client response (401, 403, 404, 422)
        try {
          const probe = await fetch(url, { method: 'GET', credentials: 'include' });
          if (probe.status >= 400 && probe.status < 500) {
            // Non-retryable HTTP 4xx error. Terminate reconnect attempts.
            return;
          }
        } catch {
          // Network offline / connection drop, retryable
        }

        // Check if maximum reconnect attempts reached
        if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
          return;
        }

        reconnectAttemptsRef.current += 1;
        const delay = Math.min(
          30000,
          1000 * Math.pow(1.5, reconnectAttemptsRef.current) + Math.floor(Math.random() * 1000)
        );
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = setTimeout(() => {
          if (!isCancelled) {
            connect();
          }
        }, delay);
      };
    }

    connect();

    // Re-sync queries and reconnect if browser tab was backgrounded and reactivated
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        queryClient.invalidateQueries({ queryKey: ['teams', hackathonId] });
        queryClient.invalidateQueries({ queryKey: ['my-team', hackathonId] });
        if (eventSourceRef.current?.readyState === EventSource.CLOSED) {
          reconnectAttemptsRef.current = 0;
          connect();
        }
      }
    };
    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);

    return () => {
      isCancelled = true;
      clearTimeout(reconnectTimeoutRef.current);
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
      if (currentEs) {
        cleanupListeners(currentEs);
        currentEs.close();
      }
      eventSourceRef.current = null;
      setStatus('disconnected');
    };
  }, [hackathonId, invalidateQueriesForEvent, queryClient]);

  return { status, lastActivity };
}
