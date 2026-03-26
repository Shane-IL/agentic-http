/**
 * Agentic-HTTP — live demo API
 *
 * A minimal user management API demonstrating the Agentic-HTTP spec.
 * Endpoints return `agent-meta` when the caller sends X-Agent-Client: true.
 * Non-agent callers receive standard responses, completely unaffected.
 *
 * Deploy to Vercel: vercel deploy (see vercel.json)
 * Run locally:      npm start
 */

const express = require('express');

const app = express();
app.use(express.json());

// ── In-memory store (resets on cold start) ──────────────────────────────────
let users = [
  { id: 'usr_001', name: 'Alice',   email: 'alice@example.com', status: 'active' },
  { id: 'usr_002', name: 'Bob',     email: 'bob@example.com',   status: 'active' },
  { id: 'usr_003', name: 'Charlie', email: 'charlie@example.com', status: 'pending-verification' },
];
let nextId = 4;

// ── Agentic-HTTP detection ──────────────────────────────────────────────────
// The demo skips scope verification so you can try it without a real OAuth token.
// In production, gate this behind `agentic:read` scope.
function isAgentRequest(req) {
  return req.headers['x-agent-client'] === 'true'
    && req.headers['x-agent-protocol'] !== undefined;
}

function agentRes(res, statusCode, data, meta) {
  if (isAgentRequest(res.req)) {
    return res.status(statusCode).json({
      data,
      'agent-meta': { version: '1.0', ...meta }
    });
  }
  return res.status(statusCode).json(data);
}

// ── Discovery ───────────────────────────────────────────────────────────────
app.get('/.well-known/agentic-http.json', (req, res) => {
  res.json({
    'agentic-http-version': '1.0',
    description: 'Agentic-HTTP live demo — user management API',
    endpoints: {
      '/users':      { methods: ['GET', 'POST'] },
      '/users/{id}': { methods: ['GET', 'DELETE'] },
    }
  });
});

// ── GET /users ───────────────────────────────────────────────────────────────
app.get('/users', (req, res) => {
  agentRes(res, 200, users, {
    intent:       'Returns a list of all registered users. Safe to call repeatedly.',
    effect:       'read',
    reversible:   true,
    idempotent:   true,
    'retry-safe': true,
    'typical-next': ['/users/{id}'],
  });
});

// ── POST /users ──────────────────────────────────────────────────────────────
app.post('/users', (req, res) => {
  const { name, email } = req.body || {};

  if (!name || !email) {
    return res.status(422).json({
      error: 'Validation failed',
      errors: [
        ...(!name  ? [{ field: 'name',  message: 'required' }] : []),
        ...(!email ? [{ field: 'email', message: 'required' }] : []),
      ]
    });
  }

  if (users.find(u => u.email === email)) {
    return res.status(409).json({ error: 'A user with this email already exists.' });
  }

  const user = { id: `usr_${String(nextId++).padStart(3, '0')}`, name, email, status: 'pending-verification' };
  users.push(user);

  agentRes(res, 201, user, {
    intent:         'Creates a new user account. Triggers a verification email to the provided address.',
    effect:         'write',
    reversible:     false,
    idempotent:     false,
    'retry-safe':   false,
    'side-effects': ['sends-email', 'creates-db-record'],
    preconditions:  ['email must not already exist in the system'],
    'typical-next': [`/users/${user.id}`],
    'error-guidance': {
      '409': 'User already exists. Do not retry. Use GET /users to retrieve the existing record.',
      '422': 'Validation failed. Inspect errors[] for field-level details before retrying.',
    },
  });
});

// ── GET /users/:id ───────────────────────────────────────────────────────────
app.get('/users/:id', (req, res) => {
  const user = users.find(u => u.id === req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  agentRes(res, 200, user, {
    intent:       'Returns details for a single user by ID.',
    effect:       'read',
    reversible:   true,
    idempotent:   true,
    'retry-safe': true,
    'error-guidance': {
      '404': 'User not found. Verify the ID using GET /users before retrying.',
    },
  });
});

// ── DELETE /users/:id ────────────────────────────────────────────────────────
app.delete('/users/:id', (req, res) => {
  const idx = users.findIndex(u => u.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'User not found.' });
  }

  const [deleted] = users.splice(idx, 1);

  agentRes(res, 200, { deleted: deleted.id }, {
    intent:         'Permanently deletes a user by ID. This action cannot be undone.',
    effect:         'delete',
    reversible:     false,
    idempotent:     true,
    'retry-safe':   false,
    'side-effects': ['removes-db-record'],
    'error-guidance': {
      '404': 'User not found or already deleted. Verify the ID using GET /users.',
    },
  });
});

// ── Root ─────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    name:    'Agentic-HTTP Demo API',
    version: '1.0',
    spec:    'https://github.com/Shane-IL/agentic-http',
    discovery: '/.well-known/agentic-http.json',
    endpoints: [
      'GET  /users',
      'POST /users',
      'GET  /users/:id',
      'DELETE /users/:id',
    ],
    hint: 'Add X-Agent-Client: true and X-Agent-Protocol: 1.0 to any request to receive agent-meta.',
  });
});

// ── Export for Vercel, listen for local ──────────────────────────────────────
if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Demo API running at http://localhost:${port}`));
}

module.exports = app;
