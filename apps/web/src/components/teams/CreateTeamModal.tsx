import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { X, Plus, Loader2, Users } from 'lucide-react';
import { useCreateTeam } from '../../hooks/useTeams';
import { useHackathon } from '../../context/HackathonContext';
import { useToast } from '../../context/ToastContext';
import { SkillPill } from '../common/SkillPill';

interface CreateTeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  hackathonId?: string;
}

export function CreateTeamModal({ isOpen, onClose, hackathonId }: CreateTeamModalProps) {
  const navigate = useNavigate();
  const { activeHackathon, hackathons } = useHackathon();
  const targetHackathon = (hackathonId ? hackathons.find((h) => h.id === hackathonId) : null) || activeHackathon;
  const { success, error: toastError } = useToast();
  const createTeamMutation = useCreateTeam();

  const minLimit = targetHackathon?.minTeamSize || 2;
  const maxLimit = targetHackathon?.maxTeamSize || 5;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [minSize, setMinSize] = useState(minLimit);
  const [maxSize, setMaxSize] = useState(maxLimit);
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setDescription('');
      setMinSize(minLimit);
      setMaxSize(maxLimit);
      setSkills([]);
      setSkillInput('');
      setErrorMessage('');
      setTimeout(() => nameInputRef.current?.focus(), 50);

      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape' && !createTeamMutation.isPending) onClose();
      };
      window.addEventListener('keydown', handleEscape);
      return () => window.removeEventListener('keydown', handleEscape);
    }
    return undefined;
  }, [isOpen, minLimit, maxLimit, createTeamMutation.isPending, onClose]);

  if (!isOpen || !activeHackathon) return null;

  const handleAddSkill = () => {
    const trimmed = skillInput.trim();
    if (trimmed && !skills.includes(trimmed) && skills.length < 10) {
      setSkills([...skills, trimmed]);
      setSkillInput('');
    }
  };

  const handleRemoveSkill = (skillToRemove: string) => {
    setSkills(skills.filter((s) => s !== skillToRemove));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (name.trim().length < 3) {
      setErrorMessage('Team name must be at least 3 characters.');
      return;
    }
    if (minSize > maxSize) {
      setErrorMessage('Minimum capacity cannot exceed maximum capacity.');
      return;
    }
    if (minSize < minLimit || maxSize > maxLimit) {
      setErrorMessage(`Team size must fall within hackathon bounds (${minLimit} – ${maxLimit}).`);
      return;
    }

    if (!targetHackathon?.id) {
      setErrorMessage('A valid hackathon must be selected to create a team.');
      return;
    }

    try {
      const created = await createTeamMutation.mutateAsync({
        hackathonId: targetHackathon.id,
        input: {
          name: name.trim(),
          description: description.trim(),
          minSize,
          maxSize,
          requiredSkills: skills
        }
      });
      success('Team created!', `Welcome to ${created.name}`);
      onClose();
      navigate(`/app/teams/${created.id}`);
    } catch (err: any) {
      const msg = err.message || 'Failed to create team';
      setErrorMessage(msg);
      toastError('Cannot create team', msg);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-team-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget && !createTeamMutation.isPending) onClose();
      }}
    >
      <div className="w-full max-w-lg p-6 rounded-2xl bg-[#171E31] border border-[#35405A] shadow-2xl text-[#E9EDF5] my-8 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-4 border-b border-[#35405A]">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-[#9BF5CC]/15 text-[#9BF5CC] flex items-center justify-center">
              <Users className="w-4 h-4" />
            </span>
            <h2 id="create-team-title" className="text-lg font-bold text-[#E9EDF5]">
              Create a Hackathon Team
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={createTeamMutation.isPending}
            className="p-1.5 rounded-lg text-[#B5C1D4] hover:text-[#E9EDF5] hover:bg-[#222A42] transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {errorMessage && (
            <div role="alert" className="p-3 rounded-lg bg-[#F87171]/10 border border-[#F87171]/30 text-xs text-[#F87171]">
              {errorMessage}
            </div>
          )}

          <div>
            <label htmlFor="team-name" className="block text-xs font-semibold text-[#E9EDF5] mb-1.5">
              Team Name <span className="text-[#9BF5CC]">*</span>
            </label>
            <input
              id="team-name"
              ref={nameInputRef}
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Pixel Forge, Cloud Runners"
              maxLength={60}
              className="w-full px-3.5 py-2.5 rounded-lg bg-[#222A42] border border-[#35405A] text-sm text-[#E9EDF5] placeholder-[#B5C1D4]/50 focus:ring-2 focus:ring-[#9BF5CC] focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="team-desc" className="block text-xs font-semibold text-[#E9EDF5] mb-1.5">
              Description
            </label>
            <textarea
              id="team-desc"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What are you planning to build? Who are you looking for?"
              maxLength={500}
              className="w-full px-3.5 py-2 rounded-lg bg-[#222A42] border border-[#35405A] text-sm text-[#E9EDF5] placeholder-[#B5C1D4]/50 focus:ring-2 focus:ring-[#9BF5CC] focus:outline-none resize-none"
            />
          </div>

          {/* Size Limits */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="team-min-size" className="block text-xs font-semibold text-[#E9EDF5] mb-1.5">
                Min Team Size ({minLimit}–{maxLimit})
              </label>
              <input
                id="team-min-size"
                type="number"
                min={minLimit}
                max={maxSize}
                value={minSize}
                onChange={(e) => setMinSize(parseInt(e.target.value, 10) || minLimit)}
                className="w-full px-3 py-2 rounded-lg bg-[#222A42] border border-[#35405A] text-sm text-[#E9EDF5] font-mono focus:ring-2 focus:ring-[#9BF5CC] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="team-max-size" className="block text-xs font-semibold text-[#E9EDF5] mb-1.5">
                Max Capacity ({minSize}–{maxLimit})
              </label>
              <input
                id="team-max-size"
                type="number"
                min={minSize}
                max={maxLimit}
                value={maxSize}
                onChange={(e) => setMaxSize(parseInt(e.target.value, 10) || maxLimit)}
                className="w-full px-3 py-2 rounded-lg bg-[#222A42] border border-[#35405A] text-sm text-[#E9EDF5] font-mono focus:ring-2 focus:ring-[#9BF5CC] focus:outline-none"
              />
            </div>
          </div>

          {/* Required Skills */}
          <div>
            <label className="block text-xs font-semibold text-[#E9EDF5] mb-1.5">
              Required Skills (Up to 10)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddSkill();
                  }
                }}
                placeholder="e.g. React, Rust, UI/UX"
                maxLength={40}
                className="flex-1 px-3 py-2 rounded-lg bg-[#222A42] border border-[#35405A] text-xs text-[#E9EDF5] placeholder-[#B5C1D4]/50 focus:ring-2 focus:ring-[#9BF5CC] focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddSkill}
                className="px-3 py-2 rounded-lg bg-[#222A42] hover:bg-[#35405A] border border-[#35405A] text-xs font-semibold text-[#E9EDF5] flex items-center gap-1 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                Add
              </button>
            </div>

            {skills.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {skills.map((skill) => (
                  <SkillPill key={skill} skill={skill} onRemove={() => handleRemoveSkill(skill)} />
                ))}
              </div>
            )}
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#35405A]">
            <button
              type="button"
              onClick={onClose}
              disabled={createTeamMutation.isPending}
              className="px-4 py-2 rounded-lg text-xs font-medium text-[#B5C1D4] hover:text-[#E9EDF5] hover:bg-[#222A42] border border-[#35405A] transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createTeamMutation.isPending}
              className="px-5 py-2 rounded-lg bg-[#9BF5CC] text-[#0B1020] text-xs font-bold hover:bg-[#86e0b7] flex items-center gap-2 transition disabled:opacity-50"
            >
              {createTeamMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Create Team
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
