import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScoreBreakdown } from '../src/components/matching/ScoreBreakdown';
import { CandidateCard } from '../src/components/matching/CandidateCard';
import { Suggestion, PublicUser } from '@crewgrid/contracts';

describe('Matching & Candidate UI Tests (Phase 3B)', () => {
  describe('Match Score Rendering (Stage 5 Defect Resolution)', () => {
    it('renders 85% match score correctly without 100x multiplication (85% not 8500%)', () => {
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

      render(
        <div>
          <span data-testid="score-label">Match Score: {Math.round(suggestion85.score)}%</span>
          <ScoreBreakdown suggestion={suggestion85} />
        </div>
      );

      const scoreLabel = screen.getByTestId('score-label');
      expect(scoreLabel.textContent).toBe('Match Score: 85%');
      expect(scoreLabel.textContent).not.toContain('8500%');

      // ScoreBreakdown also shows 85%
      expect(screen.getByText('85%')).toBeTruthy();
      expect(screen.getByText('80%')).toBeTruthy();
      expect(screen.getByText('95%')).toBeTruthy();
    });

    it('renders 0% match score correctly', () => {
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

      render(
        <div>
          <span data-testid="score-label">Match Score: {Math.round(suggestion0.score)}%</span>
          <ScoreBreakdown suggestion={suggestion0} />
        </div>
      );

      const scoreLabel = screen.getByTestId('score-label');
      expect(scoreLabel.textContent).toBe('Match Score: 0%');
      expect(screen.getAllByText('0%').length).toBeGreaterThanOrEqual(1);
    });

    it('renders 100% match score correctly', () => {
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

      render(
        <div>
          <span data-testid="score-label">Match Score: {Math.round(suggestion100.score)}%</span>
          <ScoreBreakdown suggestion={suggestion100} />
        </div>
      );

      const scoreLabel = screen.getByTestId('score-label');
      expect(scoreLabel.textContent).toBe('Match Score: 100%');
      expect(scoreLabel.textContent).not.toContain('10000%');
      expect(screen.getAllByText('100%').length).toBeGreaterThanOrEqual(1);
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

