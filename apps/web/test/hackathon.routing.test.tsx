import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router';
import { HackathonProvider, useHackathon } from '../src/context/HackathonContext';
import * as client from '../src/api/client';

const mockHackathons = [
  {
    id: '6af68f2166f291b4fcf2651a',
    slug: 'crewgrid-demo-2026',
    title: 'CrewGrid Demo Hackathon',
    minTeamSize: 2,
    maxTeamSize: 5,
    startsAt: '2026-11-13T00:00:00.000Z',
    endsAt: '2026-12-15T23:59:59.000Z',
    active: true
  },
  {
    id: '6af68f2166f291b4fcf2651b',
    slug: 'winter-hack-2026',
    title: 'Winter AI Challenge 2026',
    minTeamSize: 3,
    maxTeamSize: 6,
    startsAt: '2026-12-01T00:00:00.000Z',
    endsAt: '2026-12-31T23:59:59.000Z',
    active: true
  }
];

function TestConsumer() {
  const { activeHackathon, selectHackathon, hackathons } = useHackathon();
  const location = useLocation();

  return (
    <div>
      <div data-testid="current-path">{location.pathname}</div>
      <div data-testid="active-hackathon-id">{activeHackathon?.id || 'none'}</div>
      <div data-testid="hackathon-count">{hackathons.length}</div>
      <button
        onClick={() => selectHackathon('6af68f2166f291b4fcf2651b')}
        data-testid="switch-hackathon-btn"
      >
        Switch Hackathon
      </button>
    </div>
  );
}

describe('HackathonContext and Routing Synchronization', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    vi.spyOn(client, 'apiFetch').mockResolvedValue({
      data: mockHackathons,
      meta: { requestId: 'test-req' }
    });
  });

  it('sanitizes stale "default" from sessionStorage and selects first valid hackathon', async () => {
    sessionStorage.setItem('crewgrid_active_hackathon', 'default');

    render(
      <MemoryRouter initialEntries={['/app']}>
        <HackathonProvider>
          <TestConsumer />
        </HackathonProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('active-hackathon-id').textContent).toBe('6af68f2166f291b4fcf2651a');
    });

    expect(sessionStorage.getItem('crewgrid_active_hackathon')).toBe('6af68f2166f291b4fcf2651a');
  });

  it('automatically redirects stale "/app/events/default/teams" route to selected valid hackathon ID', async () => {
    render(
      <MemoryRouter initialEntries={['/app/events/default/teams']}>
        <HackathonProvider>
          <Routes>
            <Route path="/app/events/:id/teams" element={<TestConsumer />} />
            <Route path="*" element={<TestConsumer />} />
          </Routes>
        </HackathonProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('current-path').textContent).toBe(
        '/app/events/6af68f2166f291b4fcf2651a/teams'
      );
    });

    expect(screen.getByTestId('active-hackathon-id').textContent).toBe('6af68f2166f291b4fcf2651a');
  });

  it('synchronizes activeHackathon with valid deep-link route parameter', async () => {
    render(
      <MemoryRouter initialEntries={['/app/events/6af68f2166f291b4fcf2651b/teams']}>
        <HackathonProvider>
          <Routes>
            <Route path="/app/events/:id/teams" element={<TestConsumer />} />
          </Routes>
        </HackathonProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('active-hackathon-id').textContent).toBe('6af68f2166f291b4fcf2651b');
    });

    expect(sessionStorage.getItem('crewgrid_active_hackathon')).toBe('6af68f2166f291b4fcf2651b');
  });

  it('switching hackathons updates both active context and route URL on event-dependent paths', async () => {
    render(
      <MemoryRouter initialEntries={['/app/events/6af68f2166f291b4fcf2651a/teammates']}>
        <HackathonProvider>
          <Routes>
            <Route path="/app/events/:id/teammates" element={<TestConsumer />} />
          </Routes>
        </HackathonProvider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByTestId('current-path').textContent).toBe(
        '/app/events/6af68f2166f291b4fcf2651a/teammates'
      );
    });

    // Click switch hackathon
    fireEvent.click(screen.getByTestId('switch-hackathon-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('current-path').textContent).toBe(
        '/app/events/6af68f2166f291b4fcf2651b/teammates'
      );
      expect(screen.getByTestId('active-hackathon-id').textContent).toBe('6af68f2166f291b4fcf2651b');
    });
  });
});
