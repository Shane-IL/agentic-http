# Agentic-HTTP

> A minimal HTTP convention for agent-native API metadata.

**Website:** https://shane-il.github.io/agentic-http/ &nbsp;·&nbsp; **Spec:** [spec/README.md](spec/README.md) &nbsp;·&nbsp; **White paper:** [docs/agentic-http-whitepaper.md](docs/agentic-http-whitepaper.md)

---

**Agentic-HTTP** lets existing REST API endpoints surface semantic metadata to AI agent callers — inline, on demand, with no new transport, no wrapper, and no additional infrastructure.

When an agent sends `X-Agent-Client: true`, a compliant endpoint responds with an `agent-meta` envelope describing what the endpoint does, its side effects, whether it's safe to retry, what typically comes next, and how to recover from errors. Non-agent clients are completely unaffected.

---

## Why

Agents don't need a wrapper to call your API. They need context. Agentic-HTTP delivers that context directly from the source — the API itself — rather than through a third-party protocol layer that someone has to write and maintain.

### How is this different from OpenAPI?

OpenAPI describes **structure** — endpoints, parameters, request/response schemas. That tells an agent *what* to call and *how* to call it.

Agentic-HTTP describes **behavior** — what happens when you call it. An agent reading `agent-meta` knows:

- Is it safe to auto-retry on transient failure?
- What side effects does this call trigger (emails sent, charges made)?
- Can the action be undone?
- What should I call next to complete this workflow?
- How do I recover from *this specific* error?

The two are complementary. OpenAPI is the structural contract, written once at design time. Agentic-HTTP is the behavioral contract, delivered inline at call time. The [`openapi-to-agentic`](tools/openapi-to-agentic/) tool generates Agentic-HTTP stubs from an existing OpenAPI spec.

---

## Quick Example

**Request**
```http
POST /api/v1/users
Authorization: Bearer <token-with-agentic:read>
X-Agent-Client: true
X-Agent-Protocol: 1.0
Content-Type: application/json

{ "email": "user@example.com", "name": "Jane" }
```

**Response**
```json
{
  "data": { "id": "usr_123", "email": "user@example.com" },
  "agent-meta": {
    "version": "1.0",
    "intent": "Creates a new user account and sends a verification email.",
    "effect": "write",
    "reversible": false,
    "idempotent": false,
    "retry-safe": false,
    "side-effects": ["sends-email", "creates-db-record"],
    "preconditions": ["email must not already exist"],
    "typical-next": ["/api/v1/users/{id}/verify"],
    "error-guidance": {
      "409": "User already exists. Do not retry.",
      "422": "Validation failed. Inspect errors[] for field-level details."
    }
  }
}
```

---

## Live Demo

A working reference API (user management, four endpoints) is in [`examples/live-api/`](examples/live-api/). Deploy your own copy to Vercel in one click:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FShane-IL%2Fagentic-http&root-directory=examples%2Flive-api&project-name=agentic-http-demo)

Or run locally:
```bash
cd examples/live-api
npm install
npm start
# http://localhost:3000

# Standard call
curl http://localhost:3000/users

# Agent call — returns agent-meta
curl http://localhost:3000/users \
  -H "X-Agent-Client: true" \
  -H "X-Agent-Protocol: 1.0"
```

---

## Repo Structure

```
spec/                   Core specification (versioned)
  README.md             Full spec
  schema.json           JSON Schema (draft 2020-12) for agent-meta validation

implementations/        Reference implementations
  express/              Node.js / Express middleware
  fastapi/              Python / FastAPI decorator
  nestjs/               TypeScript / NestJS interceptor + decorator

tools/
  validator/            CLI: validates agent-meta JSON against the schema
  openapi-to-agentic/   CLI: generates agent-meta stubs from an OpenAPI spec

docs/
  agentic-http-whitepaper.md   White paper
  index.html                   GitHub Pages landing page

examples/
  user-management.md    Annotated example with agent reasoning notes
  live-api/             Deployable Express demo API (Vercel-ready)
```

---

## Status

`v1.0-draft — Open for Discussion`

The spec is open for feedback. Open an issue or join the discussion.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). All contributors must agree to the [CLA](CLA.md).

## License

Spec: [CC BY 4.0](LICENSE-spec)
Code: [MIT](LICENSE-code)
