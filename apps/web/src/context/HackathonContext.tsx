import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { HackathonResponse } from '@crewgrid/contracts';
import { apiFetch } from '../api/client';
import { isValidObjectId } from '../utils/validation';

interface HackathonContextValue {
  hackathons: HackathonResponse[];
  activeHackathon: HackathonResponse | null;
  isLoading: boolean;
  selectHackathon: (hackathonId: string) => void;
  refreshHackathons: () => Promise<void>;
}

const HackathonContext = createContext<HackathonContextValue | null>(null);

const STORAGE_KEY = 'crewgrid_active_hackathon';

export function HackathonProvider({ children }: { children: React.ReactNode }) {
  const [hackathons, setHackathons] = useState<HackathonResponse[]>([]);
  const [activeHackathon, setActiveHackathon] = useState<HackathonResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const location = useLocation();
  const navigate = useNavigate();

  // Extract hackathon ID from current route if it is an event route (/app/events/:id/...)
  const eventRouteMatch = location.pathname.match(/^\/app\/events\/([^/]+)/);
  const routeEventId = eventRouteMatch ? eventRouteMatch[1] : null;

  const refreshHackathons = useCallback(async () => {
    try {
      const res = await apiFetch<HackathonResponse[]>('/api/v1/hackathons');
      setHackathons(res.data);

      // Clean up stale or invalid sessionStorage
      let savedId: string | null = null;
      if (typeof window !== 'undefined') {
        const rawSaved = sessionStorage.getItem(STORAGE_KEY);
        if (rawSaved && isValidObjectId(rawSaved)) {
          savedId = rawSaved;
        } else if (rawSaved) {
          sessionStorage.removeItem(STORAGE_KEY);
        }
      }

      // Check current route from window.location in case it already contains a valid ID
      const currentMatch = typeof window !== 'undefined' ? window.location.pathname.match(/^\/app\/events\/([^/]+)/) : null;
      const currentRouteId = currentMatch ? currentMatch[1] : null;

      let matched: HackathonResponse | undefined;
      // Priority 1: Match route event ID if valid
      if (currentRouteId && isValidObjectId(currentRouteId)) {
        matched = res.data.find((h) => h.id === currentRouteId);
      }
      // Priority 2: Match saved ID from sessionStorage
      if (!matched && savedId) {
        matched = res.data.find((h) => h.id === savedId);
      }
      // Priority 3: Fall back to first available hackathon
      if (!matched && res.data.length > 0) {
        matched = res.data[0];
      }

      if (matched) {
        setActiveHackathon(matched);
        if (typeof window !== 'undefined') {
          sessionStorage.setItem(STORAGE_KEY, matched.id);
        }
      } else {
        setActiveHackathon(null);
      }
    } catch {
      // Ignore network errors on initial load
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshHackathons();
  }, [refreshHackathons]);

  // Synchronize route and context when navigating or if on a stale "default" route
  useEffect(() => {
    if (isLoading) return;

    // Auto-redirect stale "/app/events/default/..." routes
    if (routeEventId === 'default') {
      const targetId = activeHackathon?.id || (hackathons.length > 0 ? hackathons[0].id : null);
      if (targetId && isValidObjectId(targetId)) {
        const newPath = location.pathname.replace(/^\/app\/events\/default/, `/app/events/${targetId}`);
        navigate(newPath, { replace: true });
      } else {
        navigate('/app', { replace: true });
      }
      return;
    }

    // Synchronize activeHackathon if current route specifies a different valid hackathon
    if (routeEventId && isValidObjectId(routeEventId)) {
      if (activeHackathon?.id !== routeEventId) {
        const matched = hackathons.find((h) => h.id === routeEventId);
        if (matched) {
          setActiveHackathon(matched);
          if (typeof window !== 'undefined') {
            sessionStorage.setItem(STORAGE_KEY, matched.id);
          }
        }
      }
    }
  }, [routeEventId, isLoading, activeHackathon, hackathons, location.pathname, navigate]);

  const selectHackathon = useCallback(
    (hackathonId: string) => {
      const found = hackathons.find((h) => h.id === hackathonId);
      if (found) {
        setActiveHackathon(found);
        if (typeof window !== 'undefined') {
          sessionStorage.setItem(STORAGE_KEY, found.id);
        }

        // If currently on an event-dependent route, switch the route to the new hackathon ID
        const match = location.pathname.match(/^\/app\/events\/[^/]+(\/.*)?$/);
        if (match) {
          const subRoute = match[1] || '/teams';
          navigate(`/app/events/${found.id}${subRoute}`);
        }
      }
    },
    [hackathons, location.pathname, navigate]
  );

  return (
    <HackathonContext.Provider
      value={{
        hackathons,
        activeHackathon,
        isLoading,
        selectHackathon,
        refreshHackathons
      }}
    >
      {children}
    </HackathonContext.Provider>
  );
}

export function useHackathon(): HackathonContextValue {
  const ctx = useContext(HackathonContext);
  if (!ctx) {
    throw new Error('useHackathon must be used within HackathonProvider');
  }
  return ctx;
}
