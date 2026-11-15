import { describe, it, expect, beforeEach } from 'vitest';
import { ObjectId } from 'mongodb';
import './setup.js';
import {
  validateBenchmarkTarget,
  sanitizeMongoUri,
  ALLOWED_BENCH_DBS
} from '../src/modules/matching/benchmark.safety.js';
import { getDatabase } from '../src/db/client.js';
import { clearTestCollections } from './setup.js';

describe('Benchmark Safety & Isolation Controls (PR #4 Review)', () => {
  beforeEach(async () => {
    await clearTestCollections();
  });

  describe('validateBenchmarkTarget (Finding 1 Safety Guard)', () => {
    it('defines crewgrid_bench as the only authorized benchmark database', () => {
      expect(ALLOWED_BENCH_DBS.has('crewgrid_bench')).toBe(true);
      expect(ALLOWED_BENCH_DBS.size).toBe(1);
    });

    it('succeeds for authorized local benchmark database crewgrid_bench on 127.0.0.1', () => {
      expect(() => {
        validateBenchmarkTarget(
          'mongodb://127.0.0.1:27017/crewgrid_bench?replicaSet=rs0&directConnection=true',
          'crewgrid_bench'
        );
      }).not.toThrow();
    });

    it('succeeds for authorized local benchmark database crewgrid_bench on localhost', () => {
      expect(() => {
        validateBenchmarkTarget(
          'mongodb://localhost:27017/crewgrid_bench?replicaSet=rs0',
          'crewgrid_bench'
        );
      }).not.toThrow();
    });

    it('fails closed when database name is not in ALLOWED_BENCH_DBS', () => {
      expect(() => {
        validateBenchmarkTarget('mongodb://127.0.0.1:27017/crewgrid_dev', 'crewgrid_dev');
      }).toThrow(/not an authorized disposable benchmark database/);

      expect(() => {
        validateBenchmarkTarget('mongodb://127.0.0.1:27017/admin', 'admin');
      }).toThrow(/not an authorized disposable benchmark database/);
    });

    it('fails closed when target database name contains production or staging', () => {
      expect(() => {
        validateBenchmarkTarget('mongodb://127.0.0.1:27017/crewgrid_production', 'crewgrid_production');
      }).toThrow(/not an authorized disposable benchmark database/);

      expect(() => {
        validateBenchmarkTarget('mongodb://127.0.0.1:27017/crewgrid_staging', 'crewgrid_staging');
      }).toThrow(/not an authorized disposable benchmark database/);
    });

    it('fails closed when MongoDB URI points to a remote host (Atlas / Cloud / Render)', () => {
      expect(() => {
        validateBenchmarkTarget(
          'mongodb+srv://user:pass@remote-cluster.mongodb.net/crewgrid_bench',
          'crewgrid_bench'
        );
      }).toThrow(/not a local loopback address/);

      expect(() => {
        validateBenchmarkTarget(
          'mongodb://192.168.1.100:27017/crewgrid_bench',
          'crewgrid_bench'
        );
      }).toThrow(/not a local loopback address/);
    });

    it('fails closed when URI contains disallowed patterns such as prod or staging', () => {
      expect(() => {
        validateBenchmarkTarget(
          'mongodb://127.0.0.1:27017/crewgrid_bench?appName=production-client',
          'crewgrid_bench'
        );
      }).toThrow(/disallowed pattern/);
    });
  });

  describe('sanitizeMongoUri (Credential Protection)', () => {
    it('masks plaintext passwords in MongoDB connection strings', () => {
      const sanitized = sanitizeMongoUri('mongodb://bench_admin:superSecretPassword99@127.0.0.1:27017/crewgrid_bench');
      expect(sanitized).not.toContain('superSecretPassword99');
      expect(sanitized).toContain('***');
    });

    it('masks both username and password when present', () => {
      const sanitized = sanitizeMongoUri('mongodb://sensitive_user:sensitive_pass@localhost:27017/crewgrid_bench');
      expect(sanitized).not.toContain('sensitive_user');
      expect(sanitized).not.toContain('sensitive_pass');
    });

    it('leaves unauthenticated local URIs intact without throwing', () => {
      const sanitized = sanitizeMongoUri('mongodb://127.0.0.1:27017/crewgrid_bench?replicaSet=rs0');
      expect(sanitized).toBe('mongodb://127.0.0.1:27017/crewgrid_bench?replicaSet=rs0');
    });
  });

  describe('Isolated Fixture Lifecycle & Cleanup on Error', () => {
    it('guarantees benchmark fixture removal in finally block even when benchmark execution throws', async () => {
      const db = getDatabase();

      const fixtureLeaderId = new ObjectId();
      const fixtureTeamId = new ObjectId();
      const fixtureMembershipId = new ObjectId();

      let caughtErrorMessage: string | undefined;

      try {
        // Setup fixtures
        await db.collection('users').insertOne({
          _id: fixtureLeaderId,
          email: 'safety_test_fixture@disposable.local',
          emailNormalized: 'safety_test_fixture@disposable.local',
          passwordHash: 'dummy',
          displayName: 'Safety Test Leader',
          discoverable: false
        });

        await db.collection('teams').insertOne({
          _id: fixtureTeamId,
          hackathonId: new ObjectId(),
          name: 'SAFETY_TEST_BENCH_TEAM',
          leaderId: fixtureLeaderId,
          requiredSkills: []
        });

        await db.collection('memberships').insertOne({
          _id: fixtureMembershipId,
          teamId: fixtureTeamId,
          userId: fixtureLeaderId
        });

        // Simulate benchmark runtime error
        throw new Error('SIMULATED_BENCHMARK_EXECUTION_FAILURE');
      } catch (err: any) {
        caughtErrorMessage = err.message;
      } finally {
        // Cleanup in finally block (exact pattern used in benchmark-matching-phase3b.ts)
        await db.collection('memberships').deleteOne({ _id: fixtureMembershipId });
        await db.collection('teams').deleteOne({ _id: fixtureTeamId });
        await db.collection('users').deleteOne({ _id: fixtureLeaderId });
      }

      expect(caughtErrorMessage).toBe('SIMULATED_BENCHMARK_EXECUTION_FAILURE');

      // Verify all fixture records were completely purged
      const teamDoc = await db.collection('teams').findOne({ _id: fixtureTeamId });
      const userDoc = await db.collection('users').findOne({ _id: fixtureLeaderId });
      const membershipDoc = await db.collection('memberships').findOne({ _id: fixtureMembershipId });

      expect(teamDoc).toBeNull();
      expect(userDoc).toBeNull();
      expect(membershipDoc).toBeNull();
    });
  });
});
