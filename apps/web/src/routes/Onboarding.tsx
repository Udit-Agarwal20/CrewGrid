import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { User, Plus, Loader2, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useProfile, useUpdateProfile } from '../hooks/useProfile';
import { useToast } from '../context/ToastContext';
import { SkillPill } from '../components/common/SkillPill';

const POPULAR_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'Asia/Kolkata',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Australia/Sydney'
];

export function Onboarding() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: profile } = useProfile();
  const updateProfile = useUpdateProfile();
  const { success, error: toastError } = useToast();

  const detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [handle, setHandle] = useState(user?.handle || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [skills, setSkills] = useState<string[]>(user?.skills || []);
  const [skillInput, setSkillInput] = useState('');
  const [timezone, setTimezone] = useState(user?.timezone || detectedTz);
  const [startLocal, setStartLocal] = useState('09:00');
  const [endLocal, setEndLocal] = useState('18:00');
  const [discoverable, setDiscoverable] = useState(false); // Default OFF per S-03
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (profile) {
      if (profile.displayName) setDisplayName(profile.displayName);
      if (profile.handle) setHandle(profile.handle);
      if (profile.bio) setBio(profile.bio);
      if (profile.skills) setSkills(profile.skills);
      if (profile.timezone) setTimezone(profile.timezone);
      if (profile.preferredHours) {
        setStartLocal(profile.preferredHours.startLocal);
        setEndLocal(profile.preferredHours.endLocal);
      }
      setDiscoverable(profile.discoverable || false);
    }
  }, [profile]);

  const handleAddSkill = () => {
    const trimmed = skillInput.trim();
    if (trimmed && !skills.includes(trimmed) && skills.length < 15) {
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

    const trimmedHandle = handle.trim().toLowerCase();
    if (trimmedHandle && (trimmedHandle.length < 3 || trimmedHandle.length > 24)) {
      setErrorMessage('Handle must be between 3 and 24 characters.');
      return;
    }

    try {
      await updateProfile.mutateAsync({
        displayName: displayName.trim() || undefined,
        handle: trimmedHandle || undefined,
        bio: bio.trim() || undefined,
        skills,
        timezone,
        preferredHours: {
          startLocal,
          endLocal
        },
        discoverable
      });

      success('Profile updated!', 'Your account is now ready.');
      navigate('/app', { replace: true });
    } catch (err: any) {
      const msg = err.message || 'Failed to save profile';
      setErrorMessage(msg);
      toastError('Update failed', msg);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B1020] text-[#E9EDF5] flex items-center justify-center p-4">
      <div className="w-full max-w-xl p-6 sm:p-8 rounded-2xl bg-[#171E31] border border-[#35405A] shadow-2xl my-8">
        <div className="text-center mb-6">
          <span className="w-10 h-10 rounded-xl bg-[#9BF5CC]/15 text-[#9BF5CC] flex items-center justify-center mx-auto mb-3">
            <User className="w-5 h-5" />
          </span>
          <h1 className="text-2xl font-bold text-[#E9EDF5]">Complete Your Profile</h1>
          <p className="text-xs text-[#B5C1D4] mt-1 max-w-sm mx-auto">
            Help hackathon team leaders and matching algorithms discover your complementary skills.
          </p>
        </div>

        {errorMessage && (
          <div role="alert" className="p-3.5 mb-5 rounded-xl bg-[#F87171]/15 border border-[#F87171]/30 text-xs text-[#F87171]">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="onb-name" className="block text-xs font-semibold text-[#E9EDF5] mb-1.5">
                Display Name
              </label>
              <input
                id="onb-name"
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                maxLength={60}
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#222A42] border border-[#35405A] text-sm text-[#E9EDF5] focus:ring-2 focus:ring-[#9BF5CC] focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="onb-handle" className="block text-xs font-semibold text-[#E9EDF5] mb-1.5">
                Public Handle (@handle)
              </label>
              <input
                id="onb-handle"
                type="text"
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="adacodes"
                maxLength={24}
                className="w-full px-3.5 py-2.5 rounded-lg bg-[#222A42] border border-[#35405A] text-sm text-[#E9EDF5] font-mono focus:ring-2 focus:ring-[#9BF5CC] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label htmlFor="onb-bio" className="block text-xs font-semibold text-[#E9EDF5] mb-1.5">
              Bio / Experience (Max 280 chars)
            </label>
            <textarea
              id="onb-bio"
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Full-stack engineer specializing in distributed systems and React..."
              maxLength={280}
              className="w-full px-3.5 py-2 rounded-lg bg-[#222A42] border border-[#35405A] text-sm text-[#E9EDF5] placeholder-[#B5C1D4]/40 focus:ring-2 focus:ring-[#9BF5CC] focus:outline-none resize-none"
            />
          </div>

          {/* Skills */}
          <div>
            <label className="block text-xs font-semibold text-[#E9EDF5] mb-1.5">
              Technical Skills (Up to 15 chips)
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
                placeholder="e.g. TypeScript, React, Go, Docker"
                maxLength={40}
                className="flex-1 px-3 py-2 rounded-lg bg-[#222A42] border border-[#35405A] text-xs text-[#E9EDF5] placeholder-[#B5C1D4]/40 focus:ring-2 focus:ring-[#9BF5CC] focus:outline-none"
              />
              <button
                type="button"
                onClick={handleAddSkill}
                className="px-3.5 py-2 rounded-lg bg-[#222A42] hover:bg-[#35405A] border border-[#35405A] text-xs font-semibold text-[#E9EDF5] flex items-center gap-1 transition"
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

          {/* Timezone and Hours */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="onb-tz" className="block text-xs font-semibold text-[#E9EDF5] mb-1.5">
                Timezone
              </label>
              <select
                id="onb-tz"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-[#222A42] border border-[#35405A] text-xs text-[#E9EDF5] font-mono focus:ring-2 focus:ring-[#9BF5CC] focus:outline-none"
              >
                {POPULAR_TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="onb-start" className="block text-xs font-semibold text-[#E9EDF5] mb-1.5">
                Working Start (HH:MM)
              </label>
              <input
                id="onb-start"
                type="time"
                value={startLocal}
                onChange={(e) => setStartLocal(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#222A42] border border-[#35405A] text-xs text-[#E9EDF5] font-mono focus:ring-2 focus:ring-[#9BF5CC] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="onb-end" className="block text-xs font-semibold text-[#E9EDF5] mb-1.5">
                Working End (HH:MM)
              </label>
              <input
                id="onb-end"
                type="time"
                value={endLocal}
                onChange={(e) => setEndLocal(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#222A42] border border-[#35405A] text-xs text-[#E9EDF5] font-mono focus:ring-2 focus:ring-[#9BF5CC] focus:outline-none"
              />
            </div>
          </div>

          {/* Discoverability Opt-In (Default OFF) */}
          <div className="p-4 rounded-xl bg-[#222A42]/50 border border-[#35405A] flex items-start gap-3 mt-4">
            <input
              id="discoverable-toggle"
              type="checkbox"
              checked={discoverable}
              onChange={(e) => setDiscoverable(e.target.checked)}
              className="mt-1 w-4 h-4 rounded text-[#9BF5CC] bg-[#171E31] border-[#35405A] focus:ring-[#9BF5CC]"
            />
            <div>
              <label htmlFor="discoverable-toggle" className="text-xs font-bold text-[#E9EDF5] cursor-pointer">
                Show my profile on the Candidate Teammate Board
              </label>
              <p className="text-[11px] text-[#B5C1D4] mt-0.5 leading-relaxed">
                Default is OFF. When enabled, team leaders can view your complementary skills and send invites while you are unassigned. Email is never shown.
              </p>
            </div>
          </div>

          <button
            type="submit"
            disabled={updateProfile.isPending}
            className="w-full mt-4 py-3 px-4 rounded-xl bg-[#9BF5CC] text-[#0B1020] font-bold text-sm hover:bg-[#86e0b7] flex items-center justify-center gap-2 transition disabled:opacity-50 shadow-md shadow-[#9BF5CC]/15"
          >
            {updateProfile.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            Save Profile & Continue to Dashboard
          </button>
        </form>
      </div>
    </div>
  );
}
