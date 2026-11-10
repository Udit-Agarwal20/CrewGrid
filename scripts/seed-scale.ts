import { MongoClient, ObjectId, Db } from 'mongodb';
import argon2 from 'argon2';
import fs from 'node:fs';
import path from 'node:path';
import { initializeIndexes } from '../apps/api/src/db/indexes.js';
import { verifyAllInvariants } from './invariants/verify.js';

// Realistic random seed for determinism
class Mulberry32 {
  private s: number;
  constructor(seed: number) {
    this.s = seed;
  }
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

const RNG = new Mulberry32(20261115);

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(RNG.next() * arr.length)];
}

function sampleChoices<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr].sort(() => RNG.next() - 0.5);
  return shuffled.slice(0, count);
}

const FIRST_NAMES = [
  'Ada', 'Alan', 'Grace', 'Linus', 'Tim', 'Margaret', 'Guido', 'Brendan', 'Dennis', 'Ken',
  'Leslie', 'Barbara', 'Bjarne', 'Donald', 'Vint', 'Radia', 'Claude', 'Shafi', 'Silvio', 'Adi',
  'Ron', 'Leonard', 'John', 'Katherine', 'Dorothy', 'Mary', 'Evelyn', 'Anita', 'Frances', 'Jean',
  'Hedy', 'Sophie', 'Seymour', 'James', 'Rob', 'Ken', 'Brian', 'Dan', 'Larry', 'Sergey'
];

const LAST_NAMES = [
  'Lovelace', 'Turing', 'Hopper', 'Torvalds', 'Berners-Lee', 'Hamilton', 'van Rossum', 'Eich',
  'Ritchie', 'Thompson', 'Lamport', 'Liskov', 'Stroustrup', 'Knuth', 'Cerf', 'Perlman',
  'Shannon', 'Goldwasser', 'Micali', 'Shamir', 'Rivest', 'Adleman', 'von Neumann', 'Johnson',
  'Vaughan', 'Jackson', 'Boyd', 'Borg', 'Allen', 'Bartik', 'Lamarr', 'Wilson', 'Cray', 'Gosling'
];

const TECHNICAL_SKILLS = [
  'TypeScript', 'React', 'Node.js', 'Python', 'Go', 'Rust', 'Docker', 'Kubernetes',
  'GraphQL', 'PostgreSQL', 'MongoDB', 'AWS', 'GCP', 'TailwindCSS', 'Distributed Systems',
  'Microservices', 'Solidity', 'Machine Learning', 'Next.js', 'FastAPI', 'UI/UX', 'Kafka',
  'Redis', 'Linux', 'Terraform'
];

const TIMEZONES = [
  'UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'Europe/London', 'Europe/Berlin', 'Europe/Paris', 'Asia/Kolkata', 'Asia/Tokyo', 'Asia/Singapore'
];

const TEAM_PREFIXES = [
  'Quantum', 'Cyber', 'Neural', 'Hyper', 'Cloud', 'Data', 'Pixel', 'Vector', 'Apex', 'Binary',
  'Logic', 'Pulse', 'Matrix', 'Nexus', 'Turbo', 'Flux', 'Vortex', 'Echo', 'Sync', 'Zenith'
];

const TEAM_SUFFIXES = [
  'Runners', 'Pioneers', 'Architects', 'Builders', 'Knights', 'Squad', 'Crew', 'Forge',
  'Lab', 'Protocol', 'Engineers', 'Collective', 'Foundry', 'Ventures', 'Minds', 'Syndicate'
];

export async function runScaleSeed() {
  const args = process.argv.slice(2);
  const confirmFlag = args.includes('--confirm') || process.env.CONFIRM_SCALE_SEED === 'yes';

  const mongoUri =
    process.env.MONGODB_URI ||
    'mongodb://127.0.0.1:27017/crewgrid_bench?replicaSet=rs0&directConnection=true';
  const targetDb = process.env.MONGODB_DB || 'crewgrid_bench';

  // Strict safety guards: Never allow production or remote Atlas clusters
  if (
    targetDb.includes('prod') ||
    targetDb.includes('atlas') ||
    mongoUri.includes('mongodb.net') ||
    mongoUri.includes('crewgrid_prod')
  ) {
    throw new Error(
      `CRITICAL SAFETY ABORT: Target database '${targetDb}' or URI appears to be production. Seeding is strictly forbidden!`
    );
  }

  if (!confirmFlag) {
    console.error(
      `Safety guard: Scale seeding 10,000 users and 2,000 teams requires '--confirm' flag or CONFIRM_SCALE_SEED=yes.`
    );
    console.error(`Target database: ${targetDb}`);
    console.error(`Usage: pnpm tsx scripts/seed-scale.ts --confirm`);
    process.exit(1);
  }

  console.log(`\n======================================================`);
  console.log(`  CrewGrid Deterministic Scale Dataset Generator`);
  console.log(`======================================================`);
  console.log(`Target Database:  ${targetDb}`);
  console.log(`Target URI:       ${mongoUri}`);
  console.log(`Synthetic Scope:  10,000 Users | 2,000 Teams | Invariant Checked`);
  console.log(`Start Time:       ${new Date().toISOString()}`);

  const startTime = Date.now();
  const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 10000 });
  await client.connect();
  const db: Db = client.db(targetDb);

  try {
    // 1. Clean previous benchmark collections
    console.log(`\n1. Cleaning previous benchmark collections in '${targetDb}'...`);
    const collectionsToWipe = [
      'users',
      'sessions',
      'hackathons',
      'teams',
      'memberships',
      'join_requests',
      'invites',
      'audit_events',
      'realtime_events',
      'idempotency_keys'
    ];

    for (const collName of collectionsToWipe) {
      await db.collection(collName).drop().catch(() => {});
    }

    // 2. Initialize Indexes deterministically
    console.log(`2. Initializing deterministic MongoDB indexes...`);
    await initializeIndexes(db);

    // 3. Precompute one valid Argon2id hash for all synthetic benchmark users
    console.log(`3. Computing Argon2id reference password hash...`);
    const samplePasswordHash = await argon2.hash('BenchmarkPassword123!', {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1
    });

    // 4. Create Scale Hackathon
    console.log(`4. Seeding active scale hackathon...`);
    const hackathonId = new ObjectId('650c00000000000000000099');
    await db.collection('hackathons').insertOne({
      _id: hackathonId,
      slug: 'hack4hack-scale-2026',
      title: 'Hack4Hack Scale 2026',
      minTeamSize: 2,
      maxTeamSize: 5,
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      active: true,
      createdAt: new Date()
    });

    // 5. Generate 10,000 Users
    console.log(`5. Generating 10,000 realistic synthetic participants...`);
    const TOTAL_USERS = 10000;
    const userDocs: any[] = [];
    const userIds: ObjectId[] = [];

    for (let i = 1; i <= TOTAL_USERS; i++) {
      const uId = new ObjectId();
      userIds.push(uId);

      const fName = randomChoice(FIRST_NAMES);
      const lName = randomChoice(LAST_NAMES);
      const paddedId = i.toString().padStart(5, '0');
      const handle = `${fName.toLowerCase()}${lName.toLowerCase()}${paddedId}`;
      const email = `participant_${paddedId}@bench.crewgrid.local`;
      const numSkills = 3 + Math.floor(RNG.next() * 4); // 3 to 6 skills
      const userSkills = sampleChoices(TECHNICAL_SKILLS, numSkills);
      const timezone = randomChoice(TIMEZONES);
      const isDiscoverable = RNG.next() > 0.4; // 60% opt-in discoverable

      userDocs.push({
        _id: uId,
        emailNormalized: email,
        passwordHash: samplePasswordHash,
        displayName: `${fName} ${lName} #${i}`,
        handleNormalized: handle,
        bio: `Software builder specializing in ${userSkills.slice(0, 2).join(' and ')}. Ready for Hack4Hack 2026.`,
        skills: userSkills,
        timezone,
        preferredHours: {
          startLocal: '09:00',
          endLocal: '18:00'
        },
        discoverable: isDiscoverable,
        createdAt: new Date(Date.now() - Math.floor(RNG.next() * 30 * 86400000)),
        updatedAt: new Date()
      });
    }

    // Insert users in batches of 1,000
    for (let b = 0; b < userDocs.length; b += 1000) {
      await db.collection('users').insertMany(userDocs.slice(b, b + 1000));
    }
    console.log(`   ✓ Inserted 10,000 user profiles successfully.`);

    // 6. Generate 2,000 Teams & Memberships
    console.log(`6. Generating 2,000 teams and allocating members strictly preserving invariants...`);
    const TOTAL_TEAMS = 2000;
    const teamDocs: any[] = [];
    const membershipDocs: any[] = [];
    const auditDocs: any[] = [];
    const outboxDocs: any[] = [];

    let currentParticipantIndex = 0;

    for (let t = 1; t <= TOTAL_TEAMS; t++) {
      const teamId = new ObjectId();
      const prefix = randomChoice(TEAM_PREFIXES);
      const suffix = randomChoice(TEAM_SUFFIXES);
      const teamName = `${prefix} ${suffix} ${t}`;
      const reqSkills = sampleChoices(TECHNICAL_SKILLS, 2 + Math.floor(RNG.next() * 3));

      // Capacity configuration (bounds: 2 to 5)
      const minSize = 2;
      const maxSize = RNG.next() > 0.5 ? 4 : 5;

      // Realistic team filling distribution:
      // 20% are FULL (memberCount = maxSize)
      // 50% are FORMING with 2 or 3 members
      // 30% are FORMING with 1 member (solo leader)
      let targetMembers = 1;
      const distRoll = RNG.next();
      if (distRoll < 0.20) {
        targetMembers = maxSize; // Full team
      } else if (distRoll < 0.70) {
        targetMembers = Math.min(maxSize - 1, Math.max(2, Math.floor(RNG.next() * maxSize)));
      } else {
        targetMembers = 1; // Leader only
      }

      // Leader is the first user
      const leaderId = userIds[currentParticipantIndex++];
      const stage = targetMembers >= maxSize ? 'full' : targetMembers >= minSize ? 'ready' : 'forming';
      const createdAt = new Date(Date.now() - Math.floor(RNG.next() * 10 * 86400000));

      teamDocs.push({
        _id: teamId,
        hackathonId,
        name: teamName,
        description: `Working on an advanced ${reqSkills[0]} and ${reqSkills[1]} hackathon architecture.`,
        requiredSkills: reqSkills,
        minSize,
        maxSize,
        leaderId,
        memberCount: targetMembers,
        stage,
        deletedAt: null,
        version: targetMembers,
        createdAt,
        updatedAt: new Date()
      });

      // Member 1: Leader
      membershipDocs.push({
        _id: new ObjectId(),
        hackathonId,
        teamId,
        userId: leaderId,
        joinedAt: createdAt
      });

      auditDocs.push({
        _id: new ObjectId(),
        hackathonId,
        teamId,
        actorId: leaderId,
        action: 'team.created',
        subjectId: teamId,
        changes: { name: teamName, minSize, maxSize },
        occurredAt: createdAt,
        requestId: `seed-team-${t}`
      });

      outboxDocs.push({
        _id: new ObjectId(),
        hackathonId,
        teamId,
        type: 'team.created',
        payload: { teamId: teamId.toHexString(), name: teamName },
        createdAt,
        expiresAt: new Date(Date.now() + 7 * 86400000)
      });

      // Additional members
      for (let m = 2; m <= targetMembers; m++) {
        const memberUserId = userIds[currentParticipantIndex++];
        const joinedAt = new Date(createdAt.getTime() + m * 3600000);

        membershipDocs.push({
          _id: new ObjectId(),
          hackathonId,
          teamId,
          userId: memberUserId,
          joinedAt
        });

        auditDocs.push({
          _id: new ObjectId(),
          hackathonId,
          teamId,
          actorId: memberUserId,
          action: 'member.joined',
          subjectId: memberUserId,
          changes: { source: 'seed' },
          occurredAt: joinedAt,
          requestId: `seed-member-${t}-${m}`
        });

        outboxDocs.push({
          _id: new ObjectId(),
          hackathonId,
          teamId,
          type: 'member.joined',
          payload: { teamId: teamId.toHexString(), userId: memberUserId.toHexString() },
          createdAt: joinedAt,
          expiresAt: new Date(Date.now() + 7 * 86400000)
        });
      }
    }

    // Insert teams in batches of 500
    for (let b = 0; b < teamDocs.length; b += 500) {
      await db.collection('teams').insertMany(teamDocs.slice(b, b + 500));
    }
    console.log(`   ✓ Inserted 2,000 teams successfully.`);

    // Insert memberships in batches of 1,000
    for (let b = 0; b < membershipDocs.length; b += 1000) {
      await db.collection('memberships').insertMany(membershipDocs.slice(b, b + 1000));
    }
    console.log(`   ✓ Inserted ${membershipDocs.length} valid memberships (assigned users: ${currentParticipantIndex}, unassigned: ${TOTAL_USERS - currentParticipantIndex}).`);

    // Insert audit and outbox records in batches
    for (let b = 0; b < auditDocs.length; b += 1000) {
      await db.collection('audit_events').insertMany(auditDocs.slice(b, b + 1000));
    }
    for (let b = 0; b < outboxDocs.length; b += 1000) {
      await db.collection('realtime_events').insertMany(outboxDocs.slice(b, b + 1000));
    }
    console.log(`   ✓ Inserted audit trails (${auditDocs.length}) and realtime events (${outboxDocs.length}).`);

    const seedDurationMs = Date.now() - startTime;

    // 7. Collect Database & Collection Statistics
    console.log(`\n7. Collecting Database Storage & Index Metrics...`);
    const dbStats = await db.stats();
    const collStats: Record<string, any> = {};

    for (const c of ['users', 'hackathons', 'teams', 'memberships', 'audit_events', 'realtime_events']) {
      const count = await db.collection(c).countDocuments();
      const indexes = await db.collection(c).indexes();
      collStats[c] = {
        documentCount: count,
        indexCount: indexes.length,
        indexes: indexes.map((idx) => idx.name)
      };
    }

    // 8. Run Rigorous Database Invariant Verification on this 10,000-user Dataset
    console.log(`\n8. Executing Invariant Verification Engine on Seeded Scale Data...`);
    const { violations } = await verifyAllInvariants(mongoUri, targetDb);

    if (violations.length > 0) {
      console.error(`✗ CRITICAL ERROR: Invariants failed on seeded dataset! Found ${violations.length} violations.`);
      throw new Error(`Invariants violated during scale dataset seed: ${JSON.stringify(violations)}`);
    }

    console.log(`   ✓ 0 Invariant Violations! Dataset is mathematically sound and adheres to all PS1 rules.`);

    // 9. Generate Seed Summary Artifact
    const summary = {
      benchmarkDb: targetDb,
      timestamp: new Date().toISOString(),
      seedDurationSeconds: (seedDurationMs / 1000).toFixed(2),
      dataScale: {
        totalParticipants: TOTAL_USERS,
        assignedParticipants: currentParticipantIndex,
        unassignedParticipants: TOTAL_USERS - currentParticipantIndex,
        totalTeams: TOTAL_TEAMS,
        fullTeams: teamDocs.filter((t) => t.stage === 'full').length,
        formingTeams: teamDocs.filter((t) => t.stage === 'forming' || t.stage === 'ready').length,
        totalMemberships: membershipDocs.length,
        auditRecords: auditDocs.length,
        outboxRecords: outboxDocs.length
      },
      databaseStats: {
        dbName: targetDb,
        dataSizeMB: (dbStats.dataSize / (1024 * 1024)).toFixed(2),
        storageSizeMB: (dbStats.storageSize / (1024 * 1024)).toFixed(2),
        totalIndexSizeMB: (dbStats.indexSize / (1024 * 1024)).toFixed(2),
        collections: collStats
      },
      invariantVerification: {
        status: 'PASSED',
        violationsCount: violations.length,
        rulesChecked: [
          'I-01: Unique active membership per hackathon',
          'I-02: Team memberCount matches memberships count',
          'I-03: Team capacity limits strictly enforced',
          'I-04: Leader membership presence invariant',
          'I-05: Audit and outbox record atomicity',
          'I-06: Join request single-acceptance',
          'I-07: Single-use invite consumption'
        ]
      }
    };

    const evidenceDir = path.resolve(process.cwd(), 'evidence');
    if (!fs.existsSync(evidenceDir)) {
      fs.mkdirSync(evidenceDir, { recursive: true });
    }
    fs.writeFileSync(path.join(evidenceDir, 'seed-summary.json'), JSON.stringify(summary, null, 2));

    console.log(`\n======================================================`);
    console.log(`  Scale Seed Completed Successfully in ${(seedDurationMs / 1000).toFixed(2)}s`);
    console.log(`  Summary Report saved to: evidence/seed-summary.json`);
    console.log(`======================================================\n`);

    return summary;
  } finally {
    await client.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runScaleSeed().catch((err) => {
    console.error('Fatal error running scale seed:', err);
    process.exit(1);
  });
}
