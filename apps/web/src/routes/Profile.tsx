import React, { useState, useEffect } from 'react';
import { Link } from 'react-router';
import {
  User,
  Sparkles,
  Shield,
  Save,
  Plus,
  Loader2,
  ArrowLeft,
  Eye,
  EyeOff
} from 'lucide-react';
import { useProfile, useUpdateProfile } from '../hooks/useProfile';
import { useToast } from '../context/ToastContext';
import { AppShell } from '../components/common/AppShell';
import { PageHeader } from '../components/common/PageHeader';
import { SkillPill } from '../components/common/SkillPill';
import { SkeletonCard } from '../components/common/SkeletonCard';
import { ErrorPanel } from '../components/common/ErrorPanel';

const TIMEZONE_OPTIONS = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Amsterdam',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
  'UTC'
];

export function Profile() {
  const { data: profile, isLoading, error, refetch } = useProfile();
  const updateProfileMutation = useUpdateProfile();
  const { success, error: toastError } = useToast();

  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState('');
  const [timezone, setTimezone] = useState('UTC');
  const [startLocal, setStartLocal] = useState('09:00');
  const [endLocal, setEndLocal] = useState('18:00');
  const [isDiscoverable, setIsDiscoverable] = useState(false);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.displayName || '');
      setBio(profile.bio || '');
      setSkills(profile.skills || []);
      setTimezone(profile.timezone || 'UTC');
      if (profile.preferredHours) {
        setStartLocal(profile.preferredHours.startLocal || '09:00');
        setEndLocal(profile.preferredHours.endLocal || '18:00');
      }
      setIsDiscoverable(Boolean(profile.discoverable));
    }
  }, [profile]);

  const handleAddSkill = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = skillInput.trim().toLowerCase();
    if (trimmed && !skills.includes(trimmed) && skills.length < 12) {
      setSkills([...skills, trimmed]);
      setSkillInput('');
    }
  };

  const handleRemoveSkill = (skillToRemove: string) => {
    setSkills(skills.filter((s) => s !== skillToRemove));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await updateProfileMutation.mutateAsync({
        displayName: displayName.trim(),
        bio: bio.trim() || undefined,
        skills,
        timezone,
        preferredHours: {
          startLocal,
          endLocal
        },
        discoverable: isDiscoverable
      });
      success('Profile updated', 'Your profile changes have been saved.');
    } catch (err: any) {
      toastError('Update failed', err.message || 'Could not update profile');
    }
  };

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Navigation Breadcrumb */}
        <div className="flex items-center gap-2 text-xs font-mono text-[#B5C1D4]">
          <Link to="/app" className="hover:text-[#9BF5CC] flex items-center gap-1 transition">
            <ArrowLeft className="w-3.5 h-3.5" />
            Dashboard
          </Link>
          <span>/</span>
          <span className="text-[#E9EDF5] font-bold">Profile Settings</span>
        </div>

        <PageHeader
          title="Profile & Preferences"
          subtitle="Manage your public hackathon profile, skills, and discoverability settings for teammate recommendations."
        />

        {error && (
          <ErrorPanel
            title="Failed to Load Profile"
            message={(error as Error).message}
            onRetry={() => refetch()}
          />
        )}

        {isLoading ? (
          <div className="space-y-4">
            <SkeletonCard className="h-64" />
            <SkeletonCard className="h-48" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Identity Card */}
            <div className="p-6 rounded-2xl bg-[#171E31] border border-[#35405A] shadow-xl space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-[#9BF5CC] font-mono flex items-center gap-2">
                <User className="w-4 h-4" />
                Personal Information
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-mono font-bold text-[#B5C1D4] uppercase mb-1.5">
                    Display Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    maxLength={80}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B1020] border border-[#35405A] text-xs text-[#E9EDF5] focus:outline-none focus:border-[#9BF5CC] transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono font-bold text-[#B5C1D4] uppercase mb-1.5">
                    Handle
                  </label>
                  <input
                    type="text"
                    disabled
                    value={profile?.handle ? `@${profile.handle}` : 'No handle set'}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#222A42]/50 border border-[#35405A] text-xs font-mono text-[#B5C1D4] cursor-not-allowed"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono font-bold text-[#B5C1D4] uppercase mb-1.5">
                  Bio
                </label>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  maxLength={280}
                  rows={3}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B1020] border border-[#35405A] text-xs text-[#E9EDF5] focus:outline-none focus:border-[#9BF5CC] transition resize-none"
                  placeholder="Tell potential teammates about your experience, past hackathons, and what you enjoy building..."
                />
                <span className="text-[11px] font-mono text-[#B5C1D4]/60 block text-right mt-1">
                  {bio.length} / 280 characters
                </span>
              </div>
            </div>

            {/* Skills & Availability Card */}
            <div className="p-6 rounded-2xl bg-[#171E31] border border-[#35405A] shadow-xl space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-[#9BF5CC] font-mono flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                Skills & Availability
              </h2>

              {/* Skills Tag Input */}
              <div>
                <label className="block text-xs font-mono font-bold text-[#B5C1D4] uppercase mb-1.5">
                  Skills (Max 12)
                </label>
                <div className="flex gap-2 mb-3">
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
                    placeholder="e.g. react, typescript, mongodb, python, rust"
                    className="flex-1 px-3.5 py-2 rounded-xl bg-[#0B1020] border border-[#35405A] text-xs text-[#E9EDF5] focus:outline-none focus:border-[#9BF5CC] transition"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddSkill()}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold text-[#0B1020] bg-[#9BF5CC] hover:bg-[#86E4BA] flex items-center gap-1 transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 min-h-8 p-3 rounded-xl bg-[#0B1020] border border-[#35405A]">
                  {skills.length === 0 ? (
                    <span className="text-xs text-[#B5C1D4]/50 italic">No skills added yet.</span>
                  ) : (
                    skills.map((skill) => (
                      <SkillPill
                        key={skill}
                        skill={skill}
                        onRemove={() => handleRemoveSkill(skill)}
                      />
                    ))
                  )}
                </div>
              </div>

              {/* Timezone & Working Hours */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-mono font-bold text-[#B5C1D4] uppercase mb-1.5">
                    Timezone
                  </label>
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0B1020] border border-[#35405A] text-xs text-[#E9EDF5] focus:outline-none focus:border-[#9BF5CC] transition"
                  >
                    {TIMEZONE_OPTIONS.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-mono font-bold text-[#B5C1D4] uppercase mb-1.5">
                    Active Hours Start
                  </label>
                  <input
                    type="time"
                    value={startLocal}
                    onChange={(e) => setStartLocal(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-[#0B1020] border border-[#35405A] text-xs text-[#E9EDF5] focus:outline-none focus:border-[#9BF5CC] transition"
                  />
                </div>

                <div>
                  <label className="block text-xs font-mono font-bold text-[#B5C1D4] uppercase mb-1.5">
                    Active Hours End
                  </label>
                  <input
                    type="time"
                    value={endLocal}
                    onChange={(e) => setEndLocal(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-[#0B1020] border border-[#35405A] text-xs text-[#E9EDF5] focus:outline-none focus:border-[#9BF5CC] transition"
                  />
                </div>
              </div>
            </div>

            {/* Privacy & Discoverability Card */}
            <div className="p-6 rounded-2xl bg-[#171E31] border border-[#35405A] shadow-xl space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-[#9BF5CC] font-mono flex items-center gap-2">
                <Shield className="w-4 h-4" />
                Privacy & Discoverability
              </h2>

              <label className="flex items-start gap-3.5 p-4 rounded-xl bg-[#222A42]/50 border border-[#35405A] cursor-pointer hover:border-[#9BF5CC]/40 transition">
                <input
                  type="checkbox"
                  checked={isDiscoverable}
                  onChange={(e) => setIsDiscoverable(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded text-[#9BF5CC] focus:ring-[#9BF5CC] bg-[#0B1020] border-[#35405A]"
                />
                <div className="space-y-1">
                  <div className="text-xs font-bold text-[#E9EDF5] flex items-center gap-2">
                    {isDiscoverable ? (
                      <Eye className="w-3.5 h-3.5 text-[#9BF5CC]" />
                    ) : (
                      <EyeOff className="w-3.5 h-3.5 text-[#B5C1D4]" />
                    )}
                    Opt into Public Teammate Discovery
                  </div>
                  <p className="text-xs text-[#B5C1D4] leading-relaxed">
                    When enabled, your profile, timezone, and listed skills are visible on the Teammate Discovery board and included in algorithmic matching for teams seeking members. You can opt out at any time.
                  </p>
                </div>
              </label>
            </div>

            {/* Save Button */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="submit"
                disabled={updateProfileMutation.isPending}
                className="px-6 py-2.5 rounded-xl text-xs font-bold text-[#0B1020] bg-[#9BF5CC] hover:bg-[#86E4BA] transition flex items-center gap-2 disabled:opacity-50 shadow-lg"
              >
                {updateProfileMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Saving Changes...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save Profile
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </AppShell>
  );
}
