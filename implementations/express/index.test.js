const express = require('express');
const request = require('supertest');
const { agenticHttp, wellKnown, isAgentRequest, hasAgenticScope } = require('./index');

// Minimal valid meta for reuse across tests
const VALID_META = {
  intent: 'Creates a new user account.',
  effect: 'write',
  reversible: false,
  idempotent: false,
  'retry-safe': false,
};

// Agent headers that satisfy isAgentRequest
const AGENT_HEADERS = {
  'x-agent-client': 'true',
  'x-agent-protocol': '1.0',
};

function buildApp(meta = VALID_META, options = {}) {
  const app = express();
  app.use(express.json());

  app.post(
    '/users',
    agenticHttp(meta, options),
    (req, res) => res.status(201).json({ id: 'usr_123', email: 'jane@example.com' }),
  );

  // Route that returns an array (non-object body)
  app.get(
    '/items',
    agenticHttp(VALID_META, options),
    (req, res) => res.json([1, 2, 3]),
  );

  // Route that returns an error
  app.get(
    '/fail',
    agenticHttp(VALID_META, options),
    (req, res) => res.status(409).json({ error: 'conflict' }),
  );

  app.use(wellKnown({ description: 'Test API', endpoints: { '/users': { methods: ['POST'] } } }));

  return app;
}

// ---------------------------------------------------------------------------
// isAgentRequest
// ---------------------------------------------------------------------------
describe('isAgentRequest()', () => {
  test('returns true when both agent headers present', () => {
    const req = { headers: { 'x-agent-client': 'true', 'x-agent-protocol': '1.0' } };
    expect(isAgentRequest(req)).toBe(true);
  });

  test('returns false when x-agent-client is missing', () => {
    const req = { headers: { 'x-agent-protocol': '1.0' } };
    expect(isAgentRequest(req)).toBe(false);
  });

  test('returns false when x-agent-client is not "true"', () => {
    const req = { headers: { 'x-agent-client': '1', 'x-agent-protocol': '1.0' } };
    expect(isAgentRequest(req)).toBe(false);
  });

  test('returns false when x-agent-protocol is missing', () => {
    const req = { headers: { 'x-agent-client': 'true' } };
    expect(isAgentRequest(req)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// agenticHttp() startup validation
// ---------------------------------------------------------------------------
describe('agenticHttp() — startup validation', () => {
  test('throws when a required field is missing', () => {
    const { intent: _removed, ...incomplete } = VALID_META;
    expect(() => agenticHttp(incomplete)).toThrow('[agentic-http] Missing required field: intent');
  });

  test('does not throw when all required fields are present', () => {
    expect(() => agenticHttp(VALID_META)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Middleware — non-agent requests
// ---------------------------------------------------------------------------
describe('agenticHttp() middleware — non-agent requests', () => {
  const app = buildApp(VALID_META, {
    checkScope: () => true, // scope always passes
  });

  test('does not append agent-meta when agent headers are absent', async () => {
    const res = await request(app).post('/users').send({});
    expect(res.status).toBe(201);
    expect(res.body).not.toHaveProperty('agent-meta');
    expect(res.body).toHaveProperty('id', 'usr_123');
  });

  test('does not append agent-meta when x-agent-client is wrong value', async () => {
    const res = await request(app)
      .post('/users')
      .set('x-agent-client', 'yes')
      .set('x-agent-protocol', '1.0')
      .send({});
    expect(res.body).not.toHaveProperty('agent-meta');
  });
});

// ---------------------------------------------------------------------------
// Middleware — agent requests (scope bypassed via checkScope)
// ---------------------------------------------------------------------------
describe('agenticHttp() middleware — agent requests', () => {
  const app = buildApp(VALID_META, { checkScope: () => true });

  test('appends agent-meta on successful JSON response', async () => {
    const res = await request(app)
      .post('/users')
      .set(AGENT_HEADERS)
      .send({});

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('agent-meta');
    const meta = res.body['agent-meta'];
    expect(meta.version).toBe('1.0');
    expect(meta.intent).toBe(VALID_META.intent);
    expect(meta.effect).toBe(VALID_META.effect);
    expect(meta.reversible).toBe(false);
    expect(meta.idempotent).toBe(false);
    expect(meta['retry-safe']).toBe(false);
  });

  test('preserves original response fields alongside agent-meta', async () => {
    const res = await request(app)
      .post('/users')
      .set(AGENT_HEADERS)
      .send({});

    expect(res.body).toHaveProperty('id', 'usr_123');
    expect(res.body).toHaveProperty('email', 'jane@example.com');
  });

  test('does not append agent-meta to error responses (4xx)', async () => {
    const res = await request(app).get('/fail').set(AGENT_HEADERS);
    expect(res.status).toBe(409);
    expect(res.body).not.toHaveProperty('agent-meta');
  });

  test('does not append agent-meta when body is an array', async () => {
    const res = await request(app).get('/items').set(AGENT_HEADERS);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).not.toHaveProperty('agent-meta');
  });
});

// ---------------------------------------------------------------------------
// Middleware — scope checking
// ---------------------------------------------------------------------------
describe('agenticHttp() middleware — scope checking', () => {
  test('does not append agent-meta when checkScope returns false', async () => {
    const app = buildApp(VALID_META, { checkScope: () => false });
    const res = await request(app).post('/users').set(AGENT_HEADERS).send({});
    expect(res.body).not.toHaveProperty('agent-meta');
  });

  test('appends agent-meta when custom checkScope returns true', async () => {
    const app = buildApp(VALID_META, { checkScope: () => true });
    const res = await request(app).post('/users').set(AGENT_HEADERS).send({});
    expect(res.body).toHaveProperty('agent-meta');
  });
});

// ---------------------------------------------------------------------------
// Optional meta fields
// ---------------------------------------------------------------------------
describe('agenticHttp() — optional fields are forwarded', () => {
  const metaWithOptionals = {
    ...VALID_META,
    'side-effects': ['sends-email', 'creates-db-record'],
    preconditions: ['email must not already exist'],
    'typical-next': ['/api/v1/users/{id}/verify'],
    'error-guidance': {
      409: 'User already exists.',
    },
  };

  const app = buildApp(metaWithOptionals, { checkScope: () => true });

  test('includes optional fields in agent-meta', async () => {
    const res = await request(app).post('/users').set(AGENT_HEADERS).send({});
    const meta = res.body['agent-meta'];
    expect(meta['side-effects']).toEqual(['sends-email', 'creates-db-record']);
    expect(meta['preconditions']).toEqual(['email must not already exist']);
    expect(meta['typical-next']).toEqual(['/api/v1/users/{id}/verify']);
    expect(meta['error-guidance']['409']).toBe('User already exists.');
  });
});

// ---------------------------------------------------------------------------
// wellKnown()
// ---------------------------------------------------------------------------
describe('wellKnown()', () => {
  const app = buildApp();

  test('serves /.well-known/agentic-http.json', async () => {
    const res = await request(app).get('/.well-known/agentic-http.json');
    expect(res.status).toBe(200);
    expect(res.body['agentic-http-version']).toBe('1.0');
    expect(res.body.description).toBe('Test API');
    expect(res.body.endpoints).toEqual({ '/users': { methods: ['POST'] } });
  });

  test('well-known is accessible to non-agent clients', async () => {
    const res = await request(app).get('/.well-known/agentic-http.json');
    expect(res.status).toBe(200);
  });
});
