export const ALLOWED_BENCH_DBS = new Set(['crewgrid_bench']);
const DISALLOWED_PATTERNS = [/prod/i, /production/i, /staging/i, /live/i];

/**
 * Finding 1: Strict fail-closed validator for benchmark target database.
 * Enforces that benchmarks ONLY run against explicitly authorized local benchmark databases.
 */
export function validateBenchmarkTarget(mongoUri: string, targetDb: string): void {
  // 1. Database name check
  if (!ALLOWED_BENCH_DBS.has(targetDb)) {
    throw new Error(
      `[SECURITY ERROR] Database "${targetDb}" is not an authorized disposable benchmark database. ` +
      `Benchmarking is restricted strictly to allowed local databases: [${Array.from(ALLOWED_BENCH_DBS).join(', ')}].`
    );
  }

  for (const pattern of DISALLOWED_PATTERNS) {
    if (pattern.test(targetDb)) {
      throw new Error(`[SECURITY ERROR] Target database name "${targetDb}" matches disallowed pattern "${pattern}". Aborting.`);
    }
    if (pattern.test(mongoUri)) {
      throw new Error(`[SECURITY ERROR] MongoDB URI contains disallowed pattern "${pattern}". Aborting.`);
    }
  }

  // 2. Host check: Must be strictly local loopback (127.0.0.1, localhost, ::1)
  try {
    const parsed = new URL(mongoUri);
    const host = parsed.hostname.toLowerCase();
    const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
    if (!isLocalhost) {
      throw new Error(`[SECURITY ERROR] Benchmark target host "${host}" is not a local loopback address (127.0.0.1 / localhost). Remote execution is prohibited.`);
    }
  } catch (err: any) {
    if (err.message?.startsWith('[SECURITY ERROR]')) {
      throw err;
    }
    // Handle mongodb multi-host URI syntax
    const hostPart = mongoUri.replace(/^mongodb(\+srv)?:\/\//, '').split('/')[0]?.split('@').pop() || '';
    const hosts = hostPart.split(',').map((h) => h.split(':')[0]?.trim().toLowerCase());
    for (const hostname of hosts) {
      const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
      if (!isLocal) {
        throw new Error(`[SECURITY ERROR] Benchmark target host "${hostname}" is not local loopback. Aborting.`, { cause: err });
      }
    }
  }
}

/**
 * Finding 1: Never print connection strings containing credentials.
 */
export function sanitizeMongoUri(rawUri: string): string {
  try {
    const parsed = new URL(rawUri);
    if (parsed.password) parsed.password = '***';
    if (parsed.username) parsed.username = '***';
    return parsed.toString();
  } catch {
    return rawUri
      .replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')
      .replace(/\/\/([^@]+)@/, '//***@');
  }
}
