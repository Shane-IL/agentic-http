
Agentic-HTTP
You Don’t Need a Wrapper
A Proposal for Agent-Native REST APIs

Version 0.1 — Draft for Discussion
2026

## Abstract
Agents are good at calling APIs. They have been trained on millions of API docs, curl examples, and HTTP reference pages. Given a well-described REST endpoint and a sentence of context, a capable agent will call it correctly, chain it with other endpoints, and recover gracefully from errors. This is not a hypothesis — it is observable behavior in production agent systems today.
Against this backdrop, the industry has converged on a pattern of wrapping existing APIs in a new protocol layer — MCP — to make them “agent-friendly.” This wrapper must be written, deployed, versioned, and maintained by someone other than the API owner. It adds a new transport, a new authentication surface, and a new failure mode. For the vast majority of use cases, it adds nothing that a well-described API and a small amount of structured context could not provide more cheaply.
This paper proposes Agentic-HTTP: a minimal, backward-compatible HTTP convention that lets API endpoints surface agent-optimized metadata inline, at call time, using standard request and response headers and a lightweight JSON envelope. No wrapper. No new transport. No new process to run. Just your existing API, telling agents what they need to know.

## 1. Agents Are Already Good At This
The central claim of MCP — that AI agents need a structured intermediary to interact with external tools — made more sense in 2023 than it does now. Early LLMs were brittle callers. They hallucinated parameters, ignored error responses, and failed to chain multi-step workflows correctly.
Current frontier models are different. Claude Code, operating without any MCP infrastructure, routinely calls arbitrary CLIs, reads raw API documentation, constructs correct HTTP requests, interprets error responses, and recovers from failures. It does this because it has been trained on the accumulated knowledge of how APIs and CLIs work. It does not need a wrapper to understand what a REST endpoint does. It needs accurate information about what the endpoint does and how to reason about it.

The gap is not capability — it is context. When an agent calls an API it has never seen before, it lacks the semantic knowledge that the API owner carries in their head: which operations are destructive, which require preconditions, what typically comes next, how to interpret a 422 response in this specific domain. MCP attempts to supply this context through a wrapper that someone has to write and maintain. Agentic-HTTP proposes supplying it directly, from the API itself, at call time.
### 1.1 The Real Cost of Wrappers
Every MCP server is a maintenance liability. It must track changes to the underlying API. Its tool descriptions — the semantic layer that is supposedly MCP’s value proposition — can drift from reality silently. When the API changes, the wrapper may not. When the wrapper’s description is wrong, the agent’s behavior is wrong, and the API owner often has no visibility into this.
The people writing most MCP wrappers are not the API owners. They are third-party developers, developer relations teams, or internal platform engineers who understand the API less well than its builders. The semantic knowledge that makes the difference between a correct and incorrect agent action is being laundered through a layer written by the wrong people.

### 1.2 Context Window Tax
MCP tool definitions are loaded into the agent’s context window at session initialization. Connect several MCP servers with multiple tools each and thousands of tokens are consumed before the agent does anything useful. On constrained context windows this is a meaningful cost. On any context window it is waste — most tool definitions are never used in a given session.
Agentic-HTTP metadata is delivered on demand, inline with the response to a call the agent has already decided to make. The agent receives exactly the context it needs, exactly when it needs it, at zero additional cost on calls where no agent metadata is requested.
### 1.3 Two Infrastructure Layers Where One Suffices
The practical deployment of an MCP-based agent integration today looks like this: an existing REST API, an MCP server process wrapping it, an MCP client in the agent framework, authentication handled twice (once for the API, once for the MCP server), and monitoring split across both layers. This is the complexity cost of a protocol whose core function — providing semantic context to an agent — could be delivered with two request headers and a JSON object appended to the response.

## 2. The Agentic-HTTP Proposal
Agentic-HTTP is a convention — and eventually a ratified open spec — for inline agent-native metadata in HTTP APIs. It has three components: a signal mechanism, a metadata schema, and a discovery mechanism.

### 2.1 The Agent Signal
An agent signals its identity using two request headers. These headers are purely informational to non-compliant endpoints and are silently ignored. Existing clients are completely unaffected.

The presence of X-Agent-Client tells a compliant endpoint that the caller is an autonomous agent. X-Agent-Protocol specifies which version of the Agentic-HTTP metadata schema the caller understands, allowing the spec to evolve without breaking older clients. Optionally, agents may identify their framework:

### 2.2 The Metadata Envelope
When a compliant endpoint detects the agent signal and the caller is authenticated with the agentic:read scope, it appends an agent-meta object to its JSON response. The standard response is unchanged. Clients that do not send the agent headers receive no additional payload.
The schema defines a small core of required fields — eight in v1.0 — plus an extension mechanism for domain-specific metadata. The required fields cover the questions an agent most commonly needs answered before it can act correctly:

#### 2.2.1 Core Field Reference

### 2.3 Discovery
Three discovery mechanisms are defined in order of preference. All three support graceful degradation — agents that probe for Agentic-HTTP support and find none simply fall back to standard behavior:
- Well-known endpoint: /.well-known/agentic-http.json lists supported protocol versions and which endpoints are compliant.
- OPTIONS probe: Compliant endpoints respond to OPTIONS with Agentic-Protocol: 1.0, enabling cheap capability detection without a full request.
- Speculative headers: Agents include the signal headers on every request. Non-compliant endpoints ignore them. The absence of agent-meta signals non-compliance.

## 3. Replacing the Wrapper
The core claim of this paper is that for the majority of API-agent integration scenarios, Agentic-HTTP makes MCP unnecessary. This section makes that case directly.
### 3.1 What MCP Actually Provides
Strip away the protocol machinery and MCP provides three things:
- Tool discovery: an agent can ask what capabilities are available at runtime
- Semantic description: each tool has a description telling the agent what it does and how to call it
- Structured invocation: tool calls are formatted in a consistent schema the agent framework understands

Of these three, structured invocation is already handled by the agent’s native function-calling capability — it does not require a wrapper. Tool discovery is useful but not necessary for agents that have been given a system prompt describing available APIs, which is the common case. The only genuinely valuable contribution of MCP, for most integrations, is the semantic description layer.
Agentic-HTTP delivers that layer directly, without the rest of the overhead.
### 3.2 The Comparison

### 3.3 When MCP Is Still the Right Choice
This is not a universal argument. MCP remains the better choice in specific scenarios:
- IDE and editor integrations: where stateful session context (open files, cursor position, active project) is the core value, not API semantics
- Complex multi-step tool orchestration: where the MCP server encapsulates significant workflow logic, not just API translation
- Agent-to-agent coordination: where A2A or similar protocols are more appropriate anyway
- Aggregation gateways: where a single MCP server fronts many heterogeneous backends and normalizes their interfaces

The problem is not that MCP exists — it is that it has become the default answer for API-agent integration regardless of whether the scenario warrants it. For the common case of an agent calling a well-owned REST API, the wrapper is pure overhead.

## 4. Security Considerations
### 4.1 The Header Is a Request, Not a Trust Signal
Any client can send X-Agent-Client: true. The header signals intent, not identity. API providers must gate the agent-meta response behind authentication — not behind the presence of the header alone. An unauthenticated caller claiming to be an agent receives no metadata.
The recommended pattern is an explicit OAuth scope:

### 4.2 Metadata as Recon Surface
Richer metadata is richer information. side-effects, preconditions, and error-guidance can reveal internal system behavior to any authenticated caller who claims to be an agent. API providers should audit what their metadata reveals before enabling the feature on sensitive endpoints.
A tiered disclosure model is recommended: core fields (intent, effect, reversible, idempotent) are low-risk and can be broadly exposed. Fields like side-effects and error-guidance should be reviewed for operational sensitivity before inclusion.
### 4.3 Metadata Drift
Because agent-meta is authored and maintained by the API team, it carries a risk of falling out of sync with the actual endpoint behavior — the same risk that exists for OpenAPI descriptions today. The mitigation is the same: treat the metadata as part of the contract, include it in API change review processes, and consider automated validation in CI pipelines using the Agentic-HTTP validator tooling described in Section 5.

## 5. Adoption Path
### 5.1 For API Providers
Full compliance requires three things: detecting the agent signal headers, constructing metadata for each endpoint, and appending it to the response. For most teams the detection and injection pattern is a single middleware function or decorator — the metadata content is the only bespoke work per endpoint.
Recommended rollout order:
- Add the detection middleware to your API gateway
- Start with three to five high-traffic or agent-critical endpoints
- Populate intent, effect, reversible, and retry-safe first — these four fields eliminate the majority of dangerous agent behaviors
- Add typical-next for endpoints that are part of known workflows
- Add error-guidance for your most common agent failure modes
- Publish /.well-known/agentic-http.json once you have meaningful coverage

### 5.2 For Agent Framework Developers
Agents should be updated to consume agent-meta when present, using it to inform planning and safety decisions:
- Check reversible and retry-safe before deciding to retry or proceed autonomously on failure
- Use effect and side-effects to determine whether a confirmation step is warranted
- Use typical-next to construct correct multi-step workflows without inference from documentation
- Use error-guidance for structured, endpoint-specific recovery rather than generic retry logic
### 5.3 Reference Implementations
The following reference implementations will be published alongside the ratified spec:
- express-agentic-api — Express.js/Node.js middleware
- fastapi-agentic — FastAPI decorator for Python
- agentic-api-validator — CLI tool for schema compliance validation
- openapi-to-agentic — bootstraps agent-meta from an existing OpenAPI spec

## 6. Open Questions
This is a v0.1 draft. The following are explicitly unresolved and raised for community input:
### 6.1 Governance
Independent open spec, OpenAPI Initiative contribution, or IETF? The authors favor a small neutral steering committee of diverse implementers, with early engagement with the OpenAPI Initiative given the potential for agent-meta to become a first-class construct in OpenAPI 4.0 (Moonwalk).
### 6.2 Streaming and WebSocket APIs
The current spec assumes request/response HTTP semantics. Streaming endpoints (SSE, WebSocket) require a different delivery model — either a pre-flight metadata endpoint or a connection-initiation metadata frame. This is deferred to v1.1.
### 6.3 Signed Metadata Envelopes
For high-trust environments, cryptographic signing of the agent-meta envelope prevents man-in-the-middle metadata tampering. Out of scope for v1.0 but architecturally straightforward as an extension.
### 6.4 OpenAPI 4.0 Alignment
The best long-term outcome for Agentic-HTTP is to become unnecessary as a separate convention — absorbed into OpenAPI 4.0 as native agent-metadata fields. Early engagement with the OAI Moonwalk working group is recommended before that spec stabilizes.

## 7. Conclusion
The wrapper-first approach to agent-API integration is a local maximum. It solves the problem of today’s underpowered agents calling poorly documented APIs — a problem that is already receding as frontier models improve and as APIs improve their own documentation and semantics.
The durable solution is not a new protocol layer. It is APIs that know how to speak to their callers. APIs that can describe their own intent, effects, and constraints in a standard machine-readable format, delivered inline, without overhead, to any agent that asks.
Agentic-HTTP is a minimal bet on where agent-API integration is actually heading: away from intermediary layers and toward direct, context-rich communication between agents and the systems they need to use.

We invite API designers, agent framework developers, and standards contributors to review this draft, test the reference implementations, and help shape what comes next.

agentic-http.dev — Contributions welcome