# Agentic-HTTP Specification

**Version:** 1.0-draft  
**Status:** Draft for Discussion  
**Date:** 2026

---

## 1. Overview

Agentic-HTTP is a convention for agent-native metadata in HTTP APIs. It is backward-compatible, additive, and requires no new transport or infrastructure.

A compliant endpoint:
1. Detects the `X-Agent-Client` request header
2. Verifies the caller has the `agentic:read` OAuth scope
3. Appends an `agent-meta` object to its JSON response

---

## 2. Request Headers

Agents signal their identity using two headers:

| Header | Required | Value |
|--------|----------|-------|
| `X-Agent-Client` | Yes | `true` |
| `X-Agent-Protocol` | Yes | `1.0` |
| `X-Agent-Framework` | No | e.g. `claude-code/1.0` |

Non-compliant endpoints silently ignore these headers. Existing clients are unaffected.

---

## 3. Response Envelope

When the agent signal is detected and the caller is authorized, the endpoint appends `agent-meta` to its JSON response body.

```json
{
  "data": { },
  "agent-meta": {
    "version": "1.0",
    "intent": "string (required)",
    "effect": "read | write | delete | mixed",
    "reversible": true,
    "idempotent": true,
    "retry-safe": true,
    "side-effects": ["string"],
    "preconditions": ["string"],
    "typical-next": ["/path/to/next"],
    "error-guidance": {
      "4xx": "string"
    },
    "extensions": {
      "x-namespace-field": "value"
    }
  }
}
```

### 3.1 Field Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | string | Yes | Schema version. Currently `"1.0"`. |
| `intent` | string | Yes | Plain-language description of what this endpoint does, written for an agent reasoning about whether to call it. |
| `effect` | enum | Yes | One of: `read`, `write`, `delete`, `mixed`. |
| `reversible` | boolean | Yes | Whether the effects of this call can be undone via another API call. |
| `idempotent` | boolean | Yes | Whether calling this endpoint multiple times with the same input produces the same result. |
| `retry-safe` | boolean | Yes | Whether it is safe for the agent to automatically retry on transient failure. |
| `side-effects` | string[] | No | Machine-readable list of observable side effects. Lowercase hyphenated labels. |
| `preconditions` | string[] | No | Natural-language conditions that should be true before calling this endpoint. |
| `typical-next` | string[] | No | Ordered list of endpoint paths typically called after this one. |
| `error-guidance` | object | No | Map of HTTP status code strings to agent-readable recovery instructions. |
| `extensions` | object | No | Namespaced extension fields. Must be prefixed `x-{namespace}-`. |

### 3.2 Header Fallback

For APIs where response body modification is architecturally undesirable, metadata may be served via:

```http
X-Agent-Meta-Ref: https://api.example.com/.well-known/agentic-http/endpoints/POST-users
```

Body-based delivery is preferred.

---

## 4. Authentication and Authorization

- The `X-Agent-Client` header is a **request signal**, not a trust signal.
- Metadata must be gated behind the `agentic:read` OAuth scope.
- Unauthenticated callers receive no `agent-meta`, even if they send the correct headers.

```
Scope: agentic:read  →  full agent-meta envelope
No scope             →  standard response, no agent-meta
```

---

## 5. Discovery

### 5.1 Well-Known Endpoint (preferred)

```
GET /.well-known/agentic-http.json
```

```json
{
  "agentic-http-version": "1.0",
  "description": "Human-readable API description",
  "endpoints": {
    "/api/v1/users": { "methods": ["GET", "POST", "DELETE"] }
  }
}
```

### 5.2 OPTIONS Probe

```http
OPTIONS /api/v1/users HTTP/1.1

HTTP/1.1 200 OK
Agentic-HTTP: 1.0
```

### 5.3 Speculative Headers (graceful degradation)

Agents may send `X-Agent-Client: true` on every request. The absence of `agent-meta` in the response indicates the endpoint is non-compliant. Agents fall back to standard behavior.

---

## 6. Versioning

- The `X-Agent-Protocol` request header specifies the schema version the caller understands.
- Servers respond with the highest version they support that is ≤ the requested version.
- Breaking changes increment the major version. Additive changes are non-breaking.

---

## 7. Conformance

A compliant implementation MUST:
- Detect `X-Agent-Client: true` and `X-Agent-Protocol`
- Gate `agent-meta` behind the `agentic:read` scope
- Return all required fields (`version`, `intent`, `effect`, `reversible`, `idempotent`, `retry-safe`)
- Not modify responses for callers that do not send `X-Agent-Client: true`

A compliant implementation SHOULD:
- Publish `/.well-known/agentic-http.json`
- Populate `side-effects`, `preconditions`, `typical-next`, and `error-guidance`
- Validate `agent-meta` output against the JSON Schema (see `spec/schema.json`)
