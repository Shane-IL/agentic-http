export type Effect = 'read' | 'write' | 'delete' | 'mixed';

/**
 * The agent-meta object as it appears in the response body (spec-compliant keys).
 */
export interface AgentMeta {
  version: string;
  intent: string;
  effect: Effect;
  reversible: boolean;
  idempotent: boolean;
  'retry-safe': boolean;
  'side-effects'?: string[];
  preconditions?: string[];
  'typical-next'?: string[];
  'error-guidance'?: Record<string, string>;
  extensions?: Record<string, unknown>;
}

/**
 * Input to @AgenticMeta() — camelCase for idiomatic TypeScript.
 * Mapped to hyphenated keys in the response.
 */
export interface AgentMetaOptions {
  intent: string;
  effect: Effect;
  reversible: boolean;
  idempotent: boolean;
  retrySafe: boolean;
  sideEffects?: string[];
  preconditions?: string[];
  typicalNext?: string[];
  errorGuidance?: Record<string, string>;
  extensions?: Record<string, unknown>;
}

export interface AgenticHttpModuleOptions {
  /** Human-readable description for the well-known discovery endpoint. */
  description?: string;
  /** Map of path → { methods } for the discovery endpoint. */
  endpoints?: Record<string, { methods: string[] }>;
  /**
   * Custom scope checker. Receives the Express Request.
   * Defaults to looking for 'agentic:read' in req.auth?.payload?.scope or req.user?.scope.
   */
  checkScope?: (request: unknown) => boolean;
}

/** Token for injecting module options. */
export const AGENTIC_HTTP_OPTIONS = 'AGENTIC_HTTP_OPTIONS';
