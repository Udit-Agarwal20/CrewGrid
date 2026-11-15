import React, { useState, useEffect, useRef } from 'react';
import { Plus, Loader2, Edit } from 'lucide-react';
import { TeamResponse } from '@crewgrid/contracts';
import { Modal } from '../common/Modal';
import { useEditTeam } from '../../hooks/useTeams';
import { useHackathon } from '../../context/HackathonContext';
import { useToast } from '../../context/ToastContext';
import { SkillPill } from '../common/SkillPill';

interface EditTeamModalProps {
  isOpen: boolean;
  team: TeamResponse;
  onClose: () => void;
  onUpdated?: (updatedTeam: TeamResponse) => void;
}

export function EditTeamModal({ isOpen, team, onClose, onUpdated }: EditTeamModalProps) {
  const { activeHackathon } = useHackathon();
  const { success, error: toastError } = useToast();
  const editTeamMutation = useEditTeam();

  const minLimit = activeHackathon?.minTeamSize || 1;
  const maxLimit = activeHackathon?.maxTeamSize || 10;

  const [name, setName] = useState(team.name);
  const [description, setDescription] = useState(team.description || '');
  const [minSize, setMinSize] = useState(team.minSize);
  const [maxSize, setMaxSize] = useState(team.maxSize);
  const [skills, setSkills] = useState<string[]>(team.requiredSkills || []);
  const [skillInput, setSkillInput] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName(team.name);
      setDescription(team.description || '');
      setMinSize(team.minSize);
      setMaxSize(team.maxSize);
      setSkills(team.requiredSkills || []);
      setSkillInput('');
      setErrorMessage('');
    }
  }, [isOpen, team]);

  if (!isOpen) return null;

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
    if (maxSize < team.memberCount) {
      setErrorMessage(
        `Cannot reduce max capacity below current member count (${team.memberCount}).`
      );
      return;
    }

    try {
      const res = await editTeamMutation.mutateAsync({
        teamId: team.id,
        input: {
          name: name.trim(),
          description: description.trim(),
          minSize,
          maxSize,
          requiredSkills: skills
        }
      });
      success('Team updated', 'Changes have been applied.');
      onUpdated?.(res);
      onClose();
    } catch (err: any) {
      const msg = err.message || 'Failed to update team';
      setErrorMessage(msg);
      toastError('Cannot update team', msg);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Edit Team Details & Capacity"
      icon={<Edit className="w-4 h-4" />}
      maxWidth="max-w-lg"
      isSubmitting={editTeamMutation.isPending}
      initialFocusRef={nameInputRef}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {errorMessage && (
          <div role="alert" className="p-3 rounded-lg bg-[#F87171]/10 border border-[#F87171]/30 text-xs text-[#F87171]">
            {errorMessage}
          </div>
        )}

        <div>
          <label htmlFor="edit-team-name" className="block text-xs font-semibold text-[#E9EDF5] mb-1.5">
            Team Name
          </label>
          <input
            id="edit-team-name"
            ref={nameInputRef}
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            className="w-full px-3.5 py-2.5 rounded-lg bg-[#222A42] border border-[#35405A] text-sm text-[#E9EDF5] focus:ring-2 focus:ring-[#9BF5CC] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#9BF5CC]"
          />
        </div>

        <div>
          <label htmlFor="edit-team-desc" className="block text-xs font-semibold text-[#E9EDF5] mb-1.5">
            Description
          </label>
          <textarea
            id="edit-team-desc"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            className="w-full px-3.5 py-2 rounded-lg bg-[#222A42] border border-[#35405A] text-sm text-[#E9EDF5] focus:ring-2 focus:ring-[#9BF5CC] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#9BF5CC] resize-none"
          />
        </div>

        {/* Capacity Limits */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="edit-team-min-size" className="block text-xs font-semibold text-[#E9EDF5] mb-1.5">
              Min Team Size ({minLimit}–{maxLimit})
            </label>
            <input
              id="edit-team-min-size"
              type="number"
              min={minLimit}
              max={maxSize}
              value={minSize}
              onChange={(e) => setMinSize(parseInt(e.target.value, 10) || minLimit)}
              className="w-full px-3 py-2 rounded-lg bg-[#222A42] border border-[#35405A] text-sm text-[#E9EDF5] font-mono focus:ring-2 focus:ring-[#9BF5CC] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#9BF5CC]"
            />
          </div>
          <div>
            <label htmlFor="edit-team-max-size" className="block text-xs font-semibold text-[#E9EDF5] mb-1.5">
              Max Capacity (Min {team.memberCount} members)
            </label>
            <input
              id="edit-team-max-size"
              type="number"
              min={Math.max(minSize, team.memberCount)}
              max={maxLimit}
              value={maxSize}
              onChange={(e) => setMaxSize(parseInt(e.target.value, 10) || maxLimit)}
              className="w-full px-3 py-2 rounded-lg bg-[#222A42] border border-[#35405A] text-sm text-[#E9EDF5] font-mono focus:ring-2 focus:ring-[#9BF5CC] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#9BF5CC]"
            />
          </div>
        </div>

        {/* Required Skills */}
        <div>
          <label htmlFor="edit-team-skill-input" className="block text-xs font-semibold text-[#E9EDF5] mb-1.5">
            Skills Needed (Up to 10)
          </label>
          <div className="flex gap-2">
            <input
              id="edit-team-skill-input"
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
              className="flex-1 px-3 py-2 rounded-lg bg-[#222A42] border border-[#35405A] text-xs text-[#E9EDF5] placeholder-[#B5C1D4]/50 focus:ring-2 focus:ring-[#9BF5CC] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#9BF5CC]"
            />
            <button
              type="button"
              onClick={handleAddSkill}
              aria-label="Add"
              className="px-3 py-2 rounded-lg bg-[#222A42] hover:bg-[#35405A] border border-[#35405A] text-xs font-semibold text-[#E9EDF5] flex items-center gap-1 focus-visible:ring-2 focus-visible:ring-[#9BF5CC] focus:outline-none transition"
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
            disabled={editTeamMutation.isPending}
            className="px-4 py-2 rounded-lg text-xs font-medium text-[#B5C1D4] hover:text-[#E9EDF5] hover:bg-[#222A42] border border-[#35405A] focus-visible:ring-2 focus-visible:ring-[#9BF5CC] focus:outline-none transition disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={editTeamMutation.isPending}
            className="px-5 py-2 rounded-lg bg-[#9BF5CC] text-[#0B1020] text-xs font-bold hover:bg-[#86e0b7] focus-visible:ring-2 focus-visible:ring-[#9BF5CC] focus:outline-none flex items-center gap-2 transition disabled:opacity-50 shadow-sm"
          >
            {editTeamMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Save Changes
          </button>
        </div>
      </form>
    </Modal>
  );
}
