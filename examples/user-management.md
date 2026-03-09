# Example: User Management API with Agentic-HTTP

This example shows a minimal user management API with full Agentic-HTTP metadata
on every endpoint. It illustrates how intent, safety signals, and workflow hints
give an agent everything it needs to operate correctly — with no wrapper required.

---

## Endpoints

### GET /users

```http
GET /api/v1/users
X-Agent-Client: true
X-Agent-Protocol: 1.0
Authorization: Bearer <token-with-agentic:read>
```

```json
{
  "data": [{ "id": "usr_123", "email": "jane@example.com" }],
  "agent-meta": {
    "version": "1.0",
    "intent": "Returns a paginated list of all users. Safe to call repeatedly.",
    "effect": "read",
    "reversible": true,
    "idempotent": true,
    "retry-safe": true,
    "typical-next": ["/api/v1/users/{id}"]
  }
}
```

---

### POST /users

```http
POST /api/v1/users
X-Agent-Client: true
X-Agent-Protocol: 1.0
Authorization: Bearer <token-with-agentic:read>

{ "email": "new@example.com", "name": "New User" }
```

```json
{
  "data": { "id": "usr_456", "email": "new@example.com", "status": "pending-verification" },
  "agent-meta": {
    "version": "1.0",
    "intent": "Creates a new user account. Triggers a verification email to the provided address.",
    "effect": "write",
    "reversible": false,
    "idempotent": false,
    "retry-safe": false,
    "side-effects": ["sends-email", "creates-db-record"],
    "preconditions": ["email must not already exist in the system"],
    "typical-next": ["/api/v1/users/usr_456/verify", "/api/v1/sessions"],
    "error-guidance": {
      "409": "User with this email already exists. Do not retry. Use GET /api/v1/users?email= to retrieve the existing user.",
      "422": "Validation failed. Inspect the errors[] array for field-level details before retrying."
    }
  }
}
```

**Agent reasoning this enables:**
- `retry-safe: false` → agent will not auto-retry on network timeout (avoids duplicate accounts)
- `side-effects: ["sends-email"]` → agent surfaces this for human confirmation in sensitive contexts
- `typical-next` → agent knows to call `/verify` next without inferring it from docs
- `error-guidance["409"]` → agent recovers correctly instead of failing or retrying

---

### DELETE /users/:id

```http
DELETE /api/v1/users/usr_456
X-Agent-Client: true
X-Agent-Protocol: 1.0
Authorization: Bearer <token-with-agentic:read>
```

```json
{
  "data": { "deleted": true },
  "agent-meta": {
    "version": "1.0",
    "intent": "Permanently deletes a user account and all associated data. This action cannot be undone.",
    "effect": "delete",
    "reversible": false,
    "idempotent": true,
    "retry-safe": false,
    "side-effects": ["purges-storage", "cancels-subscriptions", "sends-email"],
    "preconditions": ["User must have no active paid subscriptions"],
    "typical-next": ["/api/v1/audit-log"],
    "error-guidance": {
      "409": "User has an active subscription. Call DELETE /api/v1/subscriptions/{id} first, then retry.",
      "404": "User not found. Do not retry — verify the user ID before proceeding."
    }
  }
}
```

**Agent reasoning this enables:**
- `reversible: false` + `side-effects` → agent escalates to human confirmation before proceeding
- `preconditions` → agent can check subscription status proactively, avoiding a predictable 409
- `idempotent: true` but `retry-safe: false` → agent understands it can retry the DELETE itself
  safely, but should not auto-retry if the precondition failure was the cause

---

## Discovery

```http
GET /.well-known/agentic-http.json
```

```json
{
  "agentic-http-version": "1.0",
  "description": "Acme User Management API v2",
  "endpoints": {
    "/api/v1/users": { "methods": ["GET", "POST"] },
    "/api/v1/users/{id}": { "methods": ["GET", "PUT", "DELETE"] },
    "/api/v1/users/{id}/verify": { "methods": ["POST"] }
  }
}
```
