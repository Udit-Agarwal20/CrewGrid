import { getMongoClient } from '../db/client.js';

export interface InvariantViolation {
  rule: string;
  severity: 'CRITICAL' | 'HIGH';
  description: string;
  documentIds?: string[];
}

export async function verifyAllInvariants(targetDbName?: string): Promise<{ violations: InvariantViolation[] }> {
  const client = getMongoClient();
  const dbName = targetDbName || process.env.MONGODB_DB || 'crewgrid_test';
  const db = client.db(dbName);

  const violations: InvariantViolation[] = [];

  const teamsCol = db.collection('teams');
  const membershipsCol = db.collection('memberships');
  const requestsCol = db.collection('join_requests');
  const invitesCol = db.collection('invites');
  const auditCol = db.collection('audit_events');
  const outboxCol = db.collection('realtime_events');

  // Rule 1: No participant belongs to two teams in the same hackathon
  const dupMemberships = await membershipsCol
    .aggregate([
      { $group: { _id: { hackathonId: '$hackathonId', userId: '$userId' }, count: { $sum: 1 }, ids: { $push: '$_id' } } },
      { $match: { count: { $gt: 1 } } }
    ])
    .toArray();

  if (dupMemberships.length > 0) {
    violations.push({
      rule: 'I-01: Unique active membership per hackathon',
      severity: 'CRITICAL',
      description: `Found ${dupMemberships.length} users with multiple active memberships in the same hackathon`,
      documentIds: dupMemberships.map((d: any) => `${d._id.hackathonId}:${d._id.userId}`)
    });
  }

  // Rule 2: Active team memberCount strictly equals count of documents in memberships collection
  const activeTeams = await teamsCol.find({ deletedAt: null }).toArray();
  for (const team of activeTeams) {
    const actualCount = await membershipsCol.countDocuments({ teamId: team._id });
    if (team.memberCount !== actualCount) {
      violations.push({
        rule: 'I-02: Team member count consistency',
        severity: 'CRITICAL',
        description: `Team ${team._id.toHexString()} has memberCount=${team.memberCount} but actual memberships=${actualCount}`,
        documentIds: [team._id.toHexString()]
      });
    }

    // Rule 3: Team size bounds (memberCount <= maxSize)
    if (team.memberCount > team.maxSize) {
      violations.push({
        rule: 'I-03: Team capacity limit invariant',
        severity: 'CRITICAL',
        description: `Team ${team._id.toHexString()} memberCount (${team.memberCount}) exceeds maxSize (${team.maxSize})`,
        documentIds: [team._id.toHexString()]
      });
    }

    // Rule 4: Active team leader must exist in memberships
    if (team.memberCount > 0) {
      const leaderMembership = await membershipsCol.findOne({
        teamId: team._id,
        userId: team.leaderId
      });
      if (!leaderMembership) {
        violations.push({
          rule: 'I-04: Leader membership invariant',
          severity: 'CRITICAL',
          description: `Team ${team._id.toHexString()} leader ${team.leaderId.toHexString()} is not an active member in memberships`,
          documentIds: [team._id.toHexString(), team.leaderId.toHexString()]
        });
      }
    }
  }

  // Rule 5: No duplicate accepted requests for same user and team
  const dupAcceptedRequests = await requestsCol
    .aggregate([
      { $match: { status: 'accepted' } },
      { $group: { _id: { teamId: '$teamId', userId: '$userId' }, count: { $sum: 1 }, ids: { $push: '$_id' } } },
      { $match: { count: { $gt: 1 } } }
    ])
    .toArray();

  if (dupAcceptedRequests.length > 0) {
    violations.push({
      rule: 'I-06: Request single-acceptance invariant',
      severity: 'CRITICAL',
      description: `Found duplicate accepted join requests for same user and team`,
      documentIds: dupAcceptedRequests.map((d: any) => `${d._id.teamId}:${d._id.userId}`)
    });
  }

  // Rule 6: Invites consumed more than once
  const doubleConsumedInvites = await invitesCol
    .find({
      usedAt: { $ne: null },
      usedBy: null
    })
    .toArray();

  if (doubleConsumedInvites.length > 0) {
    violations.push({
      rule: 'I-07: Invite single-use invariant',
      severity: 'HIGH',
      description: `Found consumed invites without valid usedBy user attribution`,
      documentIds: doubleConsumedInvites.map((i: any) => i._id.toHexString())
    });
  }

  // Rule 7: Domain mutations must have audit records
  const auditCount = await auditCol.countDocuments({});
  const outboxCount = await outboxCol.countDocuments({});

  if (activeTeams.length > 0 && auditCount === 0) {
    violations.push({
      rule: 'I-05: Domain mutations must have audit records',
      severity: 'HIGH',
      description: `Active teams exist but audit_events collection is empty`
    });
  }

  if (activeTeams.length > 0 && outboxCount === 0) {
    violations.push({
      rule: 'I-05: Domain mutations must have outbox records',
      severity: 'HIGH',
      description: `Active teams exist but realtime_events collection is empty`
    });
  }

  return { violations };
}

