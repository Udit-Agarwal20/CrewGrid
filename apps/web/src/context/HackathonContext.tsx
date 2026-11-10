import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { HackathonResponse } from '@crewgrid/contracts';
import { apiFetch } from '../api/client';

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

  const refreshHackathons = useCallback(async () => {
    try {
      const res = await apiFetch<HackathonResponse[]>('/api/v1/hackathons');
      setHackathons(res.data);

      const savedId = typeof window !== 'undefined' ? sessionStorage.getItem(STORAGE_KEY) : null;
      let matched = res.data.find((h) => h.id === savedId);
      if (!matched && res.data.length > 0) {
        matched = res.data[0];
      }

      if (matched) {
        setActiveHackathon(matched);
        if (typeof window !== 'undefined') {
          sessionStorage.setItem(STORAGE_KEY, matched.id);
        }
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

  const selectHackathon = useCallback(
    (hackathonId: string) => {
      const found = hackathons.find((h) => h.id === hackathonId);
      if (found) {
        setActiveHackathon(found);
        if (typeof window !== 'undefined') {
          sessionStorage.setItem(STORAGE_KEY, found.id);
        }
      }
    },
    [hackathons]
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

