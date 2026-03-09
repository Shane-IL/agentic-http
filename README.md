# Agentic-HTTP

> A minimal HTTP convention for agent-native API metadata.

**Agentic-HTTP** lets existing REST API endpoints surface semantic metadata to AI agent callers — inline, on demand, with no new transport, no wrapper, and no additional infrastructure.

When an agent sends `X-Agent-Client: true`, a compliant endpoint responds with an `agent-meta` envelope describing what the endpoint does, its side effects, whether it's safe to retry, what typically comes next, and how to recover from errors. Non-agent clients are completely unaffected.

---

## Why

Agents don't need a wrapper to call your API. They need context. Agentic-HTTP delivers that context directly from the source — the API itself — rather than through a third-party protocol layer that someone has to write and maintain.

→ Read the [white paper](docs/whitepaper.md)  
→ Read the [spec](spec/README.md)  
→ See [reference implementations](implementations/)

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

## Repo Structure

```
spec/               Core specification (versioned)
implementations/    Reference implementations
  express/          Node.js / Express middleware
  fastapi/          Python / FastAPI decorator
tools/
  validator/        CLI schema compliance validator
docs/               White paper and guides
examples/           Annotated example APIs
```

---

## Status

`v0.1 — Draft for Discussion`

The spec is open for feedback. Open an issue or join the discussion.

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). All contributors must agree to the [CLA](CLA.md).

## License

Spec: [CC BY 4.0](LICENSE-spec)  
Code: [MIT](LICENSE-code)
