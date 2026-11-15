import { ObjectId } from 'mongodb';
import { getDatabase } from '../../db/client.js';
import { teamRepo } from '../teams/team.repo.js';
import { membershipRepo } from '../membership/membership.repo.js';
import { UserDocument } from '../../middleware/session.js';
import { toPublicUser } from '../profile/profile.routes.js';
import { PublicUser, Suggestion, AppError } from '@crewgrid/contracts';

export function getTimezoneOffsetMinutes(timeZone: string, refDate: Date = new Date()): number {
  try {
    const utcDate = new Date(refDate.toLocaleString('en-US', { timeZone: 'UTC' }));
    const tzDate = new Date(refDate.toLocaleString('en-US', { timeZone }));
    return Math.round((tzDate.getTime() - utcDate.getTime()) / 60000);
  } catch {
    return 0;
  }
}

export function calculateWorkingOverlapHours(
  candTz?: string,
  teamTz?: string,
  candPreferred?: { startLocal: string; endLocal: string },
  teamPreferred?: { startLocal: string; endLocal: string }
): { overlapHours: number; valid: boolean } {
  if (!candTz || !teamTz) {
    return { overlapHours: 0, valid: false };
  }

  const refDate = new Date('2026-06-01T12:00:00Z');
  const candOffsetMin = getTimezoneOffsetMinutes(candTz, refDate);
  const teamOffsetMin = getTimezoneOffsetMinutes(teamTz, refDate);

  const parseHour = (timeStr?: string, defaultHour: number = 9): number => {
    if (!timeStr) return defaultHour;
    const parts = timeStr.split(':').map(Number);
    const h = parts[0] ?? defaultHour;
    const m = parts[1] ?? 0;
    return h + m / 60;
  };

  const candStartLocal = parseHour(candPreferred?.startLocal, 9);
  const candEndLocal = parseHour(candPreferred?.endLocal, 18);
  const teamStartLocal = parseHour(teamPreferred?.startLocal, 9);
  const teamEndLocal = parseHour(teamPreferred?.endLocal, 18);

  const candStartUtc = Math.floor(((candStartLocal * 60 - candOffsetMin) % 1440 + 1440) % 1440);
  const candDurationMin = Math.max(0, Math.floor((candEndLocal - candStartLocal) * 60));

  const teamStartUtc = Math.floor(((teamStartLocal * 60 - teamOffsetMin) % 1440 + 1440) % 1440);
  const teamDurationMin = Math.max(0, Math.floor((teamEndLocal - teamStartLocal) * 60));

  let overlapMin = 0;
  for (let m = 0; m < 1440; m++) {
    const inCand = isMinuteInWindow(m, candStartUtc, candDurationMin);
    const inTeam = isMinuteInWindow(m, teamStartUtc, teamDurationMin);
    if (inCand && inTeam) {
      overlapMin++;
    }
  }

  return { overlapHours: Math.round((overlapMin / 60) * 10) / 10, valid: true };
}

function isMinuteInWindow(m: number, start: number, duration: number): boolean {
  if (duration >= 1440) return true;
  const end = (start + duration) % 1440;
  if (start <= end) {
    return m >= start && m < end;
  } else {
    return m >= start || m < end;
  }
}

export function compareSuggestions(a: Suggestion, b: Suggestion): number {
  if (b.score !== a.score) return b.score - a.score;
  if (b.components.complementarySkills !== a.components.complementarySkills) {
    return b.components.complementarySkills - a.components.complementarySkills;
  }
  if (b.components.timezoneFit !== a.components.timezoneFit) {
    return b.components.timezoneFit - a.components.timezoneFit;
  }
  return a.userId.localeCompare(b.userId);
}

export class TopKSuggestions {
  private readonly k: number;
  public readonly items: Suggestion[] = [];

  constructor(k = 20) {
    this.k = k;
  }

  get worstItem(): Suggestion | undefined {
    return this.items.length >= this.k ? this.items[this.items.length - 1] : undefined;
  }

  get worstScore(): number {
    return this.worstItem ? this.worstItem.score : -1;
  }

  add(item: Suggestion): void {
    if (this.items.length < this.k) {
      this.items.push(item);
      this.items.sort(compareSuggestions);
      return;
    }

    const worst = this.items[this.items.length - 1]!;
    if (compareSuggestions(item, worst) >= 0) {
      return;
    }

    this.items[this.items.length - 1] = item;
    this.items.sort(compareSuggestions);
  }

  getResults(): Suggestion[] {
    return this.items;
  }
}

export class MatchingService {
  private get db() {
    return getDatabase();
  }

  /**
   * A-27: Unassigned discoverable teammate candidate board
   */
  async getTeammatesBoard(params: {
    hackathonId: ObjectId;
    skill?: string;
    timezone?: string;
    cursor?: { updatedAt: Date; id: ObjectId };
    limit: number;
  }): Promise<{ candidates: PublicUser[]; hasMore: boolean; nextCursor: string | null }> {
    const { hackathonId, skill, timezone, cursor, limit } = params;

    const matchStage: any = {
      discoverable: true
    };

    if (skill) {
      const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      matchStage.skills = { $elemMatch: { $regex: `^${escaped}$`, $options: 'i' } };
    }

    if (timezone) {
      matchStage.timezone = timezone;
    }

    if (cursor) {
      matchStage.$or = [
        { updatedAt: { $lt: cursor.updatedAt } },
        { updatedAt: cursor.updatedAt, _id: { $lt: cursor.id } }
      ];
    }

    // C06: Use an indexed $lookup anti-join instead of pulling all assigned user IDs into memory
    const pipeline: any[] = [
      { $match: matchStage },
      { $sort: { updatedAt: -1, _id: -1 } },
      {
        $lookup: {
          from: 'memberships',
          let: { uid: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$hackathonId', hackathonId] },
                    { $eq: ['$userId', '$$uid'] }
                  ]
                }
              }
            },
            { $project: { _id: 1 } },
            { $limit: 1 }
          ],
          as: 'membership'
        }
      },
      { $match: { membership: { $size: 0 } } },
      {
        $project: {
          _id: 1,
          displayName: 1,
          handleNormalized: 1,
          bio: 1,
          skills: 1,
          timezone: 1,
          preferredHours: 1,
          discoverable: 1,
          updatedAt: 1
        }
      },
      { $limit: limit + 1 }
    ];

    const docs = await this.db
      .collection<UserDocument>('users')
      .aggregate<UserDocument>(pipeline)
      .toArray();

    const hasMore = docs.length > limit;
    const pageItems = hasMore ? docs.slice(0, limit) : docs;
    const nextCursor =
      hasMore && pageItems.length > 0
        ? Buffer.from(
            JSON.stringify({
              u: pageItems[pageItems.length - 1]!.updatedAt.toISOString(),
              id: pageItems[pageItems.length - 1]!._id.toHexString()
            })
          ).toString('base64url')
        : null;

    const candidates = pageItems.map(toPublicUser);
    return { candidates, hasMore, nextCursor };
  }

  /**
   * A-28: Deterministic explainable teammate recommendation ranking
   */
  async getTeamSuggestions(params: {
    teamId: ObjectId;
    leaderId: ObjectId;
  }): Promise<Suggestion[]> {
    const { teamId, leaderId } = params;

    const team = await teamRepo.findActiveById(teamId);
    if (!team) {
      throw new AppError(404, 'TEAM_NOT_FOUND', 'Team not found or has been deleted');
    }

    if (!team.leaderId.equals(leaderId)) {
      throw new AppError(403, 'NOT_TEAM_LEADER', 'Only the team leader can view teammate suggestions');
    }

    // 1. Gather all team members and their combined skills
    const memberships = await membershipRepo.findTeamMembers(teamId);
    const memberUserIds = memberships.map((m) => m.userId);
    const memberUsers = await this.db
      .collection<UserDocument>('users')
      .find({ _id: { $in: memberUserIds } })
      .toArray();

    const leaderUser = memberUsers.find((u) => u._id.equals(leaderId));
    const teamTz = leaderUser?.timezone || memberUsers.find((u) => u.timezone)?.timezone;
    const teamPreferred = leaderUser?.preferredHours;

    const teamSkillSet = new Set<string>();
    for (const member of memberUsers) {
      for (const s of member.skills || []) {
        teamSkillSet.add(s.toLowerCase());
      }
    }

    const requiredSkills = team.requiredSkills || [];
    const missingSkills = requiredSkills.filter((r) => !teamSkillSet.has(r.toLowerCase()));

    // 2. Query eligible candidates with indexed anti-join (C05, C06: complete, scalable, streaming)
    // We avoid arbitrary pre-truncation ($limit: 300) to ensure exact global top-20 ranking
    // while keeping memory strictly bounded to O(K) via TopKSuggestions.
    const pipeline: any[] = [
      {
        $match: {
          discoverable: true
        }
      },
      {
        $lookup: {
          from: 'memberships',
          let: { uid: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$hackathonId', team.hackathonId] },
                    { $eq: ['$userId', '$$uid'] }
                  ]
                }
              }
            },
            { $project: { _id: 1 } },
            { $limit: 1 }
          ],
          as: 'm'
        }
      },
      { $match: { m: { $size: 0 } } },
      {
        $project: {
          _id: 1,
          displayName: 1,
          skills: 1,
          timezone: 1,
          preferredHours: 1
        }
      }
    ];

    const cursor = this.db
      .collection<UserDocument>('users')
      .aggregate<UserDocument>(pipeline, { batchSize: 500 });

    const topK = new TopKSuggestions(20);

    for await (const cand of cursor) {
      const candSkills = (cand.skills || []).map((s) => s.toLowerCase());

      // Complementary Skills Score C
      let compSkillsScore: number;
      let skillReason: string;

      if (missingSkills.length > 0) {
        const covered = missingSkills.filter((m) => candSkills.includes(m.toLowerCase()));
        compSkillsScore = Math.round((covered.length / missingSkills.length) * 100);
        skillReason =
          covered.length > 0
            ? `Covers ${covered.join(', ')} (${covered.length}/${missingSkills.length} missing required skills)`
            : `Covers 0/${missingSkills.length} missing required skills`;
      } else {
        const novel = candSkills.filter((s) => !teamSkillSet.has(s));
        if (candSkills.length > 0) {
          compSkillsScore = Math.round(Math.min(100, (novel.length / candSkills.length) * 100));
          skillReason =
            novel.length > 0
              ? `Provides complementary skill(s): ${novel.join(', ')}`
              : 'All candidate skills already represented in team';
        } else {
          compSkillsScore = 0;
          skillReason = 'No candidate skills listed';
        }
      }

      // Mathematical upper bound pruning:
      // Since timezoneFitScore <= 100, score <= round(0.7 * compSkillsScore + 30).
      // If upper bound cannot beat current 20th candidate, skip timezone calculation.
      const maxPossibleScore = Math.round(0.7 * compSkillsScore + 30);
      const worst = topK.worstItem;
      if (topK.items.length >= 20 && worst) {
        if (
          maxPossibleScore < worst.score ||
          (maxPossibleScore === worst.score && compSkillsScore < worst.components.complementarySkills)
        ) {
          continue;
        }
      }

      // Timezone Fit Score T
      let timezoneFitScore: number;
      let timezoneReason: string;

      const { overlapHours, valid } = calculateWorkingOverlapHours(
        cand.timezone,
        teamTz,
        cand.preferredHours,
        teamPreferred
      );

      if (valid) {
        timezoneFitScore = Math.min(100, Math.round((overlapHours / 4) * 100));
        timezoneReason = `${overlapHours.toFixed(1)} hours of daily working overlap between ${cand.timezone} and ${teamTz}`;
      } else {
        timezoneFitScore = 0;
        timezoneReason = 'Timezone information missing for availability calculation';
      }

      // Overall Score: 0.7 * C + 0.3 * T
      const score = Math.round(0.7 * compSkillsScore + 0.3 * timezoneFitScore);

      topK.add({
        userId: cand._id.toHexString(),
        displayName: cand.displayName,
        score,
        components: {
          complementarySkills: compSkillsScore,
          timezoneFit: timezoneFitScore
        },
        reasons: [skillReason, timezoneReason]
      });
    }

    return topK.getResults();
  }
}

export const matchingService = new MatchingService();
