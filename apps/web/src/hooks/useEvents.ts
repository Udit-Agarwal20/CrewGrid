import { useEffect, useState, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RealtimeEventEnvelope, RealtimeEventType } from '@crewgrid/contracts';

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

export function useEvents(hackathonId: string | undefined) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ConnectionState>('disconnected');
  const [lastActivity, setLastActivity] = useState<Date | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<any>(null);

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
    if (!hackathonId) {
      setStatus('disconnected');
      return;
    }

    let isCancelled = false;
    let currentEs: EventSource | null = null;

    const handleEvent = (messageEvent: MessageEvent) => {
      if (isCancelled) return;
      try {
        const envelope: RealtimeEventEnvelope = JSON.parse(messageEvent.data);
        setLastActivity(new Date());
        invalidateQueriesForEvent(envelope);
      } catch {
        // Ignore heartbeat comments or non-json keep-alive
      }
    };

    function cleanupListeners(es: EventSource) {
      es.onopen = null;
      es.onmessage = null;
      es.onerror = null;
      for (const eventName of SUPPORTED_SSE_EVENTS) {
        es.removeEventListener(eventName, handleEvent as EventListener);
      }
    }

    function connect() {
      if (currentEs) {
        cleanupListeners(currentEs);
        currentEs.close();
      }

      setStatus('connecting');

      const url = `/api/v1/hackathons/${hackathonId}/events`;
      const es = new EventSource(url, { withCredentials: true });
      currentEs = es;
      eventSourceRef.current = es;

      es.onopen = () => {
        if (!isCancelled) {
          setStatus('connected');
          setLastActivity(new Date());
        }
      };

      // Handle standard message events
      es.onmessage = handleEvent;

      // Register listeners for all server-named SSE event types
      for (const eventName of SUPPORTED_SSE_EVENTS) {
        es.addEventListener(eventName, handleEvent as EventListener);
      }

      es.onerror = () => {
        if (isCancelled) return;
        setStatus('disconnected');
        cleanupListeners(es);
        es.close();

        // Reconnect after 3 seconds with jitter
        const delay = 3000 + Math.floor(Math.random() * 1000);
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
