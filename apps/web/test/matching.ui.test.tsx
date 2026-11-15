import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router';
import { SuggestionCard } from '../src/components/matching/SuggestionCard';
import { CandidateCard } from '../src/components/matching/CandidateCard';
import { TeammateDiscovery } from '../src/routes/TeammateDiscovery';
import { Suggestion, PublicUser } from '@crewgrid/contracts';
import * as teammateHooks from '../src/hooks/useTeammates';
import * as teamHooks from '../src/hooks/useTeams';
import * as authContext from '../src/context/AuthContext';

vi.mock('../src/components/common/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div data-testid="app-shell">{children}</div>
}));

vi.mock('../src/context/AuthContext', () => ({
  useAuth: vi.fn()
}));

vi.mock('../src/hooks/useTeams', () => ({
  useMyTeam: vi.fn()
}));

vi.mock('../src/hooks/useTeammates', () => ({
  useTeammates: vi.fn(),
  useTeamSuggestions: vi.fn()
}));

function SwitchEventHelper() {
  const navigate = useNavigate();
  return (
    <button
      data-testid="switch-event-btn"
      onClick={() => navigate('/app/events/6af68f2166f291b4fcf2651b/teammates')}
    >
      Switch Event
    </button>
  );
}

describe('Matching & Candidate UI Tests (Phase 3B)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.mocked(authContext.useAuth).mockReturnValue({
      user: { id: '650c00000000000000000099', email: 'leader@crewgrid.dev', displayName: 'Leader' }
    } as any);
    vi.mocked(teamHooks.useMyTeam).mockReturnValue({
      data: null,
      isLoading: false
    } as any);
    vi.mocked(teammateHooks.useTeamSuggestions).mockReturnValue({
      data: [],
      isLoading: false
    } as any);
  });

  describe('Finding D — Production SuggestionCard Match Score Rendering', () => {
    it('renders 85% match score correctly on production SuggestionCard without 100x multiplication', () => {
      const suggestion85: Suggestion = {
        userId: '650c00000000000000000001',
        displayName: 'Senior Fullstack',
        score: 85,
        components: {
          complementarySkills: 80,
          timezoneFit: 95
        },
        reasons: ['Covers TypeScript, React', '7.0 hours of working overlap']
      };

      render(<SuggestionCard suggestion={suggestion85} />);

      const scoreBadge = screen.getByTestId('match-score-badge');
      expect(scoreBadge.textContent).toBe('Match Score: 85%');
      expect(scoreBadge.textContent).not.toContain('8500%');

      // ScoreBreakdown inside SuggestionCard also shows 85%
      expect(screen.getByText('85%')).toBeTruthy();
      expect(screen.getByText('80%')).toBeTruthy();
      expect(screen.getByText('95%')).toBeTruthy();
    });

    it('renders 0% match score correctly on production SuggestionCard', () => {
      const suggestion0: Suggestion = {
        userId: '650c00000000000000000002',
        displayName: 'Unmatched Candidate',
        score: 0,
        components: {
          complementarySkills: 0,
          timezoneFit: 0
        },
        reasons: ['Covers 0 required skills', 'No timezone overlap']
      };

      render(<SuggestionCard suggestion={suggestion0} />);

      const scoreBadge = screen.getByTestId('match-score-badge');
      expect(scoreBadge.textContent).toBe('Match Score: 0%');
      expect(screen.getAllByText('0%').length).toBeGreaterThanOrEqual(1);
    });

    it('renders 100% match score correctly on production SuggestionCard', () => {
      const suggestion100: Suggestion = {
        userId: '650c00000000000000000003',
        displayName: 'Perfect Match',
        score: 100,
        components: {
          complementarySkills: 100,
          timezoneFit: 100
        },
        reasons: ['Covers all missing required skills', '9.0 hours of daily working overlap']
      };

      render(<SuggestionCard suggestion={suggestion100} />);

      const scoreBadge = screen.getByTestId('match-score-badge');
      expect(scoreBadge.textContent).toBe('Match Score: 100%');
      expect(scoreBadge.textContent).not.toContain('10000%');
      expect(screen.getAllByText('100%').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Finding C — Cross-Hackathon Pagination Reset', () => {
    it('resets cursor and pagination back to page 1 when switching hackathonId while mounted', async () => {
      const useTeammatesSpy = vi.mocked(teammateHooks.useTeammates);
      useTeammatesSpy.mockImplementation((hackathonId, filters) => {
        const isPage2 = filters?.cursor === 'cursor_page_2';
        return {
          data: {
            data: [
              {
                id: isPage2 ? 'cand_2' : 'cand_1',
                displayName: isPage2 ? 'Candidate Two' : 'Candidate One',
                handle: isPage2 ? 'cand2' : 'cand1',
                skills: ['Rust'],
                timezone: 'UTC',
                preferredHours: { startLocal: '09:00', endLocal: '18:00' },
                discoverable: true
              }
            ],
            meta: {
              requestId: 'req-1',
              hasMore: !isPage2,
              nextCursor: isPage2 ? null : 'cursor_page_2'
            }
          },
          isLoading: false,
          error: null,
          refetch: vi.fn()
        } as any;
      });

      render(
        <MemoryRouter initialEntries={['/app/events/6af68f2166f291b4fcf2651a/teammates']}>
          <SwitchEventHelper />
          <Routes>
            <Route path="/app/events/:id/teammates" element={<TeammateDiscovery />} />
          </Routes>
        </MemoryRouter>
      );

      // Initially on Page 1 for event A
      expect(screen.getByText(/Page 1/)).toBeTruthy();
      expect(screen.getByText('Candidate One')).toBeTruthy();

      // Navigate to Next page (Page 2)
      const nextBtn = screen.getByRole('button', { name: /Next page of candidates/i });
      fireEvent.click(nextBtn);

      // Now on Page 2
      expect(screen.getByText(/Page 2/)).toBeTruthy();
      expect(screen.getByText('Candidate Two')).toBeTruthy();

      // Switch to Event B while mounted
      const switchBtn = screen.getByTestId('switch-event-btn');
      fireEvent.click(switchBtn);

      // Pagination must reset to Page 1 for event B, clearing cursor and history
      expect(screen.getByText(/Page 1/)).toBeTruthy();
      expect(screen.getByText('Candidate One')).toBeTruthy();

      // Verify that useTeammates was called for the new event B with cursor: undefined
      const lastCall = useTeammatesSpy.mock.calls[useTeammatesSpy.mock.calls.length - 1];
      expect(lastCall[0]).toBe('6af68f2166f291b4fcf2651b');
      expect(lastCall[1]?.cursor).toBeUndefined();
    });
  });

  describe('CandidateCard Component', () => {
    it('renders public candidate attributes cleanly without leaking sensitive fields', () => {
      const user: PublicUser = {
        id: '650c00000000000000000010',
        displayName: 'Diana Prince',
        handle: 'diana_p',
        bio: 'Distributed systems architect and open-source contributor.',
        skills: ['Rust', 'Distributed Systems', 'Kubernetes'],
        timezone: 'UTC',
        preferredHours: {
          startLocal: '09:00',
          endLocal: '18:00'
        },
        discoverable: true
      };

      render(<CandidateCard user={user} />);

      expect(screen.getByText('Diana Prince')).toBeTruthy();
      expect(screen.getByText('@diana_p')).toBeTruthy();
      expect(screen.getByText('Distributed systems architect and open-source contributor.')).toBeTruthy();
      expect(screen.getByText('UTC')).toBeTruthy();
      expect(screen.getByText(/Hours: 09:00–18:00/)).toBeTruthy();
      expect(screen.getByText('Rust')).toBeTruthy();
      expect(screen.getByText('Distributed Systems')).toBeTruthy();
      expect(screen.getByText('Kubernetes')).toBeTruthy();
    });
  });
});
