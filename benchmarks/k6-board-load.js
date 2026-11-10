import http from 'k6/http';
import { check, sleep } from 'k6';

// Read generated authenticated sessions
const sessionData = JSON.parse(open('./sessions.json'));
const HACKATHON_ID = sessionData.hackathonId;
const SESSIONS = sessionData.sessions;

const SKILLS = [
  'TypeScript',
  'React',
  'Node.js',
  'Python',
  'Go',
  'Rust',
  'Docker',
  'PostgreSQL',
  'MongoDB',
  'AWS'
];

export const options = {
  scenarios: {
    // 10-second warm-up ramp up to prime server JIT and MongoDB cache
    warmup: {
      executor: 'ramping-vus',
      startVUs: 10,
      stages: [
        { duration: '5s', target: 50 },
        { duration: '5s', target: 100 }
      ],
      gracefulStop: '2s',
      exec: 'runBenchmark'
    },
    // Sustained 100 concurrent virtual users
    sustained_100_vus: {
      executor: 'constant-vus',
      vus: 100,
      duration: '45s',
      startTime: '12s',
      gracefulStop: '5s',
      exec: 'runBenchmark'
    }
  },
  thresholds: {
    'http_req_duration{endpoint:board}': ['p(95)<200'], // Competition Target: p95 < 200ms
    'http_req_failed{endpoint:board}': ['rate<0.01'],   // Error rate < 1%
    'http_req_duration{endpoint:board_filtered}': ['p(95)<200'],
    'http_req_duration{endpoint:board_cursor}': ['p(95)<200'],
    'http_req_duration{endpoint:teammates}': ['p(95)<250']
  }
};

const BASE_URL = __ENV.API_URL || 'http://127.0.0.1:3000';

export function runBenchmark() {
  const vuIndex = (__VU - 1) % SESSIONS.length;
  const session = SESSIONS[vuIndex];

  const params = {
    headers: {
      'Cookie': `crewgrid_session=${session.token}`,
      'Accept': 'application/json'
    },
    tags: { endpoint: 'board' }
  };

  // 1. Live Team Board - Default Page 1
  const resBoard = http.get(
    `${BASE_URL}/api/v1/hackathons/${HACKATHON_ID}/teams?limit=12`,
    params
  );

  check(resBoard, {
    'board status is 200': (r) => r.status === 200,
    'board returns data array': (r) => {
      try {
        const json = JSON.parse(r.body);
        return Array.isArray(json.data) && json.data.length > 0;
      } catch {
        return false;
      }
    }
  });

  let nextCursor = null;
  try {
    const json = JSON.parse(resBoard.body);
    nextCursor = json.meta && json.meta.nextCursor;
  } catch {}

  // 2. Cursor Pagination - Page 2 (if cursor returned)
  if (nextCursor) {
    const cursorParams = {
      headers: {
        'Cookie': `crewgrid_session=${session.token}`,
        'Accept': 'application/json'
      },
      tags: { endpoint: 'board_cursor' }
    };

    const resCursor = http.get(
      `${BASE_URL}/api/v1/hackathons/${HACKATHON_ID}/teams?cursor=${encodeURIComponent(nextCursor)}&limit=12`,
      cursorParams
    );

    check(resCursor, {
      'cursor page status is 200': (r) => r.status === 200
    });
  }

  // 3. Filtered Query - Skill Filter
  const randomSkill = SKILLS[Math.floor(Math.random() * SKILLS.length)];
  const skillParams = {
    headers: {
      'Cookie': `crewgrid_session=${session.token}`,
      'Accept': 'application/json'
    },
    tags: { endpoint: 'board_filtered' }
  };

  const resSkill = http.get(
    `${BASE_URL}/api/v1/hackathons/${HACKATHON_ID}/teams?skill=${randomSkill}&limit=12`,
    skillParams
  );

  check(resSkill, {
    'skill filter status is 200': (r) => r.status === 200
  });

  // 4. Candidate Teammates Discovery
  const teammateParams = {
    headers: {
      'Cookie': `crewgrid_session=${session.token}`,
      'Accept': 'application/json'
    },
    tags: { endpoint: 'teammates' }
  };

  const resTeammates = http.get(
    `${BASE_URL}/api/v1/hackathons/${HACKATHON_ID}/teammates?limit=12`,
    teammateParams
  );

  check(resTeammates, {
    'teammates status is 200': (r) => r.status === 200
  });

  // Realistic human think-time jitter (20ms to 50ms)
  sleep(0.02 + Math.random() * 0.03);
}

