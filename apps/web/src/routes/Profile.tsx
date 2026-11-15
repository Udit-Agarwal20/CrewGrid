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
        <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
          <Link to="/app" className="hover:text-white flex items-center gap-1 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            Dashboard
          </Link>
          <span>/</span>
          <span className="text-white font-bold">Profile Settings</span>
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
            <div className="p-6 sm:p-7 rounded-2xl bg-[#111114] border border-[#2C2826] shadow-xl space-y-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-white font-mono flex items-center gap-2">
                <User className="w-4 h-4 text-[#FF7A45]" />
                Personal Information
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="profile-display-name" className="block text-xs font-mono font-bold text-zinc-400 uppercase mb-1.5">
                    Display Name *
                  </label>
                  <input
                    id="profile-display-name"
                    type="text"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    maxLength={80}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#18181C] border border-[#2C2826] hover:border-[#4E4A48] text-xs text-white focus:outline-none focus:ring-2 focus:ring-white focus-visible:ring-2 focus-visible:ring-white transition-colors"
                  />
                </div>

                <div>
                  <label htmlFor="profile-handle" className="block text-xs font-mono font-bold text-zinc-400 uppercase mb-1.5">
                    Handle
                  </label>
                  <input
                    id="profile-handle"
                    type="text"
                    disabled
                    value={profile?.handle ? `@${profile.handle}` : 'No handle set'}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#18181C]/50 border border-[#2C2826] text-xs font-mono text-zinc-500 cursor-not-allowed"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="profile-bio" className="block text-xs font-mono font-bold text-zinc-400 uppercase mb-1.5">
                  Bio
                </label>
                <textarea
                  id="profile-bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  maxLength={280}
                  rows={3}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#18181C] border border-[#2C2826] hover:border-[#4E4A48] text-xs text-white focus:outline-none focus:ring-2 focus:ring-white focus-visible:ring-2 focus-visible:ring-white transition-colors resize-none leading-relaxed"
                  placeholder="Tell potential teammates about your experience, past hackathons, and what you enjoy building..."
                />
                <span className="text-[11px] font-mono text-zinc-400 block text-right mt-1">
                  {bio.length} / 280 characters
                </span>
              </div>
            </div>

            {/* Skills & Availability Card */}
            <div className="p-6 sm:p-7 rounded-2xl bg-[#111114] border border-[#2C2826] shadow-xl space-y-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-white font-mono flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#FF7A45]" />
                Skills & Availability
              </h2>

              {/* Skills Tag Input */}
              <div>
                <label htmlFor="profile-skill-input" className="block text-xs font-mono font-bold text-zinc-400 uppercase mb-1.5">
                  Skills (Max 12)
                </label>
                <div className="flex gap-2 mb-3">
                  <input
                    id="profile-skill-input"
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
                    aria-label="Add skill to profile"
                    className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#18181C] border border-[#2C2826] hover:border-[#4E4A48] text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-white focus-visible:ring-2 focus-visible:ring-white transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddSkill()}
                    aria-label="Add skill button"
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-black bg-white hover:bg-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white flex items-center gap-1 transition-all duration-200 active:scale-95 shadow-sm"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 min-h-8 p-3.5 rounded-xl bg-[#08080A] border border-[#2C2826]">
                  {skills.length === 0 ? (
                    <span className="text-xs text-zinc-400 italic">No skills added yet.</span>
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
                  <label htmlFor="profile-timezone" className="block text-xs font-mono font-bold text-zinc-400 uppercase mb-1.5">
                    Timezone
                  </label>
                  <select
                    id="profile-timezone"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#18181C] border border-[#2C2826] hover:border-[#4E4A48] text-xs text-white focus:outline-none focus:ring-2 focus:ring-white focus-visible:ring-2 focus-visible:ring-white transition-colors"
                  >
                    {TIMEZONE_OPTIONS.map((tz) => (
                      <option key={tz} value={tz} className="bg-[#111114] text-white">
                        {tz}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="profile-start-time" className="block text-xs font-mono font-bold text-zinc-400 uppercase mb-1.5">
                    Active Hours Start
                  </label>
                  <input
                    id="profile-start-time"
                    type="time"
                    value={startLocal}
                    onChange={(e) => setStartLocal(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#18181C] border border-[#2C2826] hover:border-[#4E4A48] text-xs text-white focus:outline-none focus:ring-2 focus:ring-white focus-visible:ring-2 focus-visible:ring-white transition-colors"
                  />
                </div>

                <div>
                  <label htmlFor="profile-end-time" className="block text-xs font-mono font-bold text-zinc-400 uppercase mb-1.5">
                    Active Hours End
                  </label>
                  <input
                    id="profile-end-time"
                    type="time"
                    value={endLocal}
                    onChange={(e) => setEndLocal(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#18181C] border border-[#2C2826] hover:border-[#4E4A48] text-xs text-white focus:outline-none focus:ring-2 focus:ring-white focus-visible:ring-2 focus-visible:ring-white transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* Privacy & Discoverability Card */}
            <div className="p-6 sm:p-7 rounded-2xl bg-[#111114] border border-[#2C2826] shadow-xl space-y-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-white font-mono flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#FF7A45]" />
                Privacy & Discoverability
              </h2>

              <label htmlFor="profile-discoverable-toggle" className="flex items-start gap-3.5 p-4 sm:p-5 rounded-xl bg-[#18181C] border border-[#2C2826] cursor-pointer hover:border-[#4E4A48] transition-colors">
                <input
                  id="profile-discoverable-toggle"
                  type="checkbox"
                  checked={isDiscoverable}
                  onChange={(e) => setIsDiscoverable(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded text-white focus:ring-white bg-[#08080A] border-[#2C2826] accent-white"
                />
                <div className="space-y-1">
                  <div className="text-xs font-bold text-white flex items-center gap-2">
                    {isDiscoverable ? (
                      <Eye className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <EyeOff className="w-3.5 h-3.5 text-zinc-500" />
                    )}
                    Opt into Public Teammate Discovery
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">
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
                className="px-8 py-3 rounded-full text-xs font-bold text-black bg-white hover:bg-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-white transition-all duration-200 active:scale-95 flex items-center gap-2 disabled:opacity-50 shadow-md shadow-white/10"
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
