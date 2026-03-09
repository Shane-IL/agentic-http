import 'reflect-metadata';
import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AgenticMeta } from './agentic-meta.decorator';
import { AgenticHttpModule } from './agentic-http.module';

const AGENT_HEADERS = {
  'x-agent-client': 'true',
  'x-agent-protocol': '1.0',
};

const VALID_META = {
  intent: 'Creates a new user account.',
  effect: 'write' as const,
  reversible: false,
  idempotent: false,
  retrySafe: false,
};

// ---------------------------------------------------------------------------
// Test controller — mirrors a typical user-management API
// ---------------------------------------------------------------------------

@Controller('users')
class UsersController {
  @Post()
  @HttpCode(201)
  @AgenticMeta(VALID_META)
  create() {
    return { id: 'usr_123', email: 'jane@example.com' };
  }

  @Get('items')
  @AgenticMeta(VALID_META)
  listArray() {
    return [1, 2, 3]; // array — should not be enriched
  }

  @Get('conflict')
  @HttpCode(409)
  @AgenticMeta(VALID_META)
  conflict() {
    return { error: 'conflict' }; // 4xx — should not be enriched
  }

  @Get('no-meta')
  noMeta() {
    return { plain: true }; // undecorated — never enriched
  }

  @Get('with-optionals')
  @AgenticMeta({
    intent: 'Retrieves paginated user list.',
    effect: 'read',
    reversible: true,
    idempotent: true,
    retrySafe: true,
    sideEffects: ['logs-access'],
    preconditions: ['caller must have admin role'],
    typicalNext: ['/api/v1/users/{id}'],
    errorGuidance: { '403': 'Insufficient permissions.' },
  })
  withOptionals() {
    return { users: [] };
  }
}

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

async function buildApp(overrides: { checkScope?: (r: unknown) => boolean } = {}) {
  const module: TestingModule = await Test.createTestingModule({
    imports: [
      AgenticHttpModule.forRoot({
        description: 'Test API',
        endpoints: { '/users': { methods: ['GET', 'POST'] } },
        ...overrides,
      }),
    ],
    controllers: [UsersController],
  }).compile();

  const app = module.createNestApplication();
  await app.init();
  return app;
}

// ---------------------------------------------------------------------------
// Non-agent requests
// ---------------------------------------------------------------------------

describe('non-agent requests', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  beforeAll(async () => { app = await buildApp({ checkScope: () => true }); });
  afterAll(async () => { await app.close(); });

  it('does not append agent-meta when agent headers are absent', async () => {
    const res = await request(app.getHttpServer()).post('/users');
    expect(res.status).toBe(201);
    expect(res.body).not.toHaveProperty('agent-meta');
    expect(res.body).toHaveProperty('id', 'usr_123');
  });

  it('does not append agent-meta when x-agent-client is wrong value', async () => {
    const res = await request(app.getHttpServer())
      .post('/users')
      .set('x-agent-client', 'yes')
      .set('x-agent-protocol', '1.0');
    expect(res.body).not.toHaveProperty('agent-meta');
  });

  it('does not append agent-meta when x-agent-protocol is missing', async () => {
    const res = await request(app.getHttpServer())
      .post('/users')
      .set('x-agent-client', 'true');
    expect(res.body).not.toHaveProperty('agent-meta');
  });
});

// ---------------------------------------------------------------------------
// Agent requests — scope satisfied via checkScope
// ---------------------------------------------------------------------------

describe('agent requests', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  beforeAll(async () => { app = await buildApp({ checkScope: () => true }); });
  afterAll(async () => { await app.close(); });

  it('appends agent-meta on a successful response', async () => {
    const res = await request(app.getHttpServer())
      .post('/users')
      .set(AGENT_HEADERS);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('agent-meta');
    const meta = res.body['agent-meta'];
    expect(meta.version).toBe('1.0');
    expect(meta.intent).toBe(VALID_META.intent);
    expect(meta.effect).toBe('write');
    expect(meta.reversible).toBe(false);
    expect(meta.idempotent).toBe(false);
    expect(meta['retry-safe']).toBe(false);
  });

  it('preserves original response fields', async () => {
    const res = await request(app.getHttpServer())
      .post('/users')
      .set(AGENT_HEADERS);
    expect(res.body).toHaveProperty('id', 'usr_123');
    expect(res.body).toHaveProperty('email', 'jane@example.com');
  });

  it('does not enrich 4xx responses', async () => {
    const res = await request(app.getHttpServer())
      .get('/users/conflict')
      .set(AGENT_HEADERS);
    expect(res.status).toBe(409);
    expect(res.body).not.toHaveProperty('agent-meta');
  });

  it('does not enrich array bodies', async () => {
    const res = await request(app.getHttpServer())
      .get('/users/items')
      .set(AGENT_HEADERS);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).not.toHaveProperty('agent-meta');
  });

  it('does not enrich undecorated routes', async () => {
    const res = await request(app.getHttpServer())
      .get('/users/no-meta')
      .set(AGENT_HEADERS);
    expect(res.body).not.toHaveProperty('agent-meta');
    expect(res.body).toHaveProperty('plain', true);
  });
});

// ---------------------------------------------------------------------------
// Scope checking
// ---------------------------------------------------------------------------

describe('scope checking', () => {
  it('does not enrich when checkScope returns false', async () => {
    const app = await buildApp({ checkScope: () => false });
    const res = await request(app.getHttpServer())
      .post('/users')
      .set(AGENT_HEADERS);
    expect(res.body).not.toHaveProperty('agent-meta');
    await app.close();
  });

  it('enriches when custom checkScope returns true', async () => {
    const app = await buildApp({ checkScope: () => true });
    const res = await request(app.getHttpServer())
      .post('/users')
      .set(AGENT_HEADERS);
    expect(res.body).toHaveProperty('agent-meta');
    await app.close();
  });
});

// ---------------------------------------------------------------------------
// Optional fields — camelCase input → hyphenated JSON output
// ---------------------------------------------------------------------------

describe('optional fields', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  beforeAll(async () => { app = await buildApp({ checkScope: () => true }); });
  afterAll(async () => { await app.close(); });

  it('maps camelCase options to hyphenated spec keys in output', async () => {
    const res = await request(app.getHttpServer())
      .get('/users/with-optionals')
      .set(AGENT_HEADERS);

    const meta = res.body['agent-meta'];
    expect(meta['side-effects']).toEqual(['logs-access']);
    expect(meta['preconditions']).toEqual(['caller must have admin role']);
    expect(meta['typical-next']).toEqual(['/api/v1/users/{id}']);
    expect(meta['error-guidance']['403']).toBe('Insufficient permissions.');
  });
});

// ---------------------------------------------------------------------------
// Well-known discovery
// ---------------------------------------------------------------------------

describe('well-known', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('serves /.well-known/agentic-http.json', async () => {
    const res = await request(app.getHttpServer())
      .get('/.well-known/agentic-http.json');
    expect(res.status).toBe(200);
    expect(res.body['agentic-http-version']).toBe('1.0');
    expect(res.body.description).toBe('Test API');
    expect(res.body.endpoints).toEqual({ '/users': { methods: ['GET', 'POST'] } });
  });

  it('is accessible without agent headers', async () => {
    const res = await request(app.getHttpServer())
      .get('/.well-known/agentic-http.json');
    expect(res.status).toBe(200);
  });
});
