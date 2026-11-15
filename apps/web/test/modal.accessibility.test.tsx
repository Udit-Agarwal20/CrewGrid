import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState, useRef } from 'react';
import { Modal } from '../src/components/common/Modal';
import { ConfirmDialog } from '../src/components/common/ConfirmDialog';
import { CandidateCard } from '../src/components/matching/CandidateCard';
import { PublicUser } from '@crewgrid/contracts';

describe('Modal Accessibility and Interaction Tests', () => {
  beforeEach(() => {
    document.body.style.overflow = '';
  });

  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('renders with role="dialog", aria-modal="true", and accessible labels', () => {
    render(
      <Modal
        isOpen={true}
        onClose={vi.fn()}
        title="Test Modal Title"
        description="Test modal description"
      >
        <button type="button">Inside Button</button>
      </Modal>
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();

    const titleEl = document.getElementById(dialog.getAttribute('aria-labelledby')!);
    expect(titleEl?.textContent).toContain('Test Modal Title');

    const descEl = document.getElementById(dialog.getAttribute('aria-describedby')!);
    expect(descEl?.textContent).toContain('Test modal description');
  });

  it('locks body scroll when open and restores when closed', () => {
    const { rerender } = render(
      <Modal isOpen={true} onClose={vi.fn()} title="Scroll Lock Test">
        <p>Modal content</p>
      </Modal>
    );

    expect(document.body.style.overflow).toBe('hidden');

    rerender(
      <Modal isOpen={false} onClose={vi.fn()} title="Scroll Lock Test">
        <p>Modal content</p>
      </Modal>
    );

    expect(document.body.style.overflow).toBe('');
  });

  it('calls onClose on Escape key press', () => {
    const handleClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={handleClose} title="Escape Test">
        <button type="button">Clickable</button>
      </Modal>
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).toHaveBeenCalledTimes(1);
  });

  it('prevents Escape key dismissal when isSubmitting is true', () => {
    const handleClose = vi.fn();
    render(
      <Modal isOpen={true} onClose={handleClose} isSubmitting={true} title="Submitting Test">
        <button type="button">Clickable</button>
      </Modal>
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(handleClose).not.toHaveBeenCalled();
  });

  it('restores focus to trigger element when closed', () => {
    function Wrapper() {
      const [isOpen, setIsOpen] = useState(false);
      const buttonRef = useRef<HTMLButtonElement>(null);

      return (
        <div>
          <button ref={buttonRef} type="button" onClick={() => setIsOpen(true)}>
            Open Dialog
          </button>
          <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Focus Return Test">
            <button type="button" onClick={() => setIsOpen(false)}>
              Close
            </button>
          </Modal>
        </div>
      );
    }

    render(<Wrapper />);
    const trigger = screen.getByText('Open Dialog');
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    fireEvent.click(trigger);
    expect(screen.getByRole('dialog')).toBeTruthy();

    const closeBtn = screen.getByText('Close');
    fireEvent.click(closeBtn);

    expect(document.activeElement).toBe(trigger);
  });
});

describe('ConfirmDialog Accessibility Tests', () => {
  it('focuses Cancel button by default when isDestructive is true', () => {
    render(
      <ConfirmDialog
        isOpen={true}
        title="Delete Team?"
        message="This action cannot be undone."
        confirmLabel="Delete"
        isDestructive={true}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    expect(document.activeElement).toBe(cancelButton);
  });
});

describe('CandidateCard C08 Invitation Hardening', () => {
  const dummyCandidate: PublicUser = {
    id: 'user_123',
    displayName: 'Ada Lovelace',
    handle: 'adalovelace',
    bio: 'Pioneer of computing looking for a squad.',
    skills: ['typescript', 'react', 'algorithms'],
    timezone: 'UTC',
    preferredHours: {
      startLocal: '09:00',
      endLocal: '17:00'
    },
    discoverable: true
  };

  it('renders candidate details and skills without candidate-specific invite action button', () => {
    render(<CandidateCard user={dummyCandidate} />);

    expect(screen.getByText('Ada Lovelace')).toBeTruthy();
    expect(screen.getByText('@adalovelace')).toBeTruthy();
    expect(screen.getByText('typescript')).toBeTruthy();
    expect(screen.getByText('react')).toBeTruthy();

    // Verify there is no misleading candidate-specific invite action button
    const inviteButton = screen.queryByRole('button', { name: /invite/i });
    expect(inviteButton).toBeNull();
  });
});
