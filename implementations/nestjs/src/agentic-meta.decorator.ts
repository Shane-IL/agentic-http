import { SetMetadata } from '@nestjs/common';
import { AgentMetaOptions } from './types';

export const AGENTIC_META_KEY = 'agentic:meta';

/**
 * Attach Agentic-HTTP metadata to a route handler.
 * When an agent request is detected, the interceptor reads this metadata
 * and appends an `agent-meta` envelope to the JSON response.
 *
 * @example
 * ```ts
 * @Post()
 * @AgenticMeta({
 *   intent: 'Creates a new user account.',
 *   effect: 'write',
 *   reversible: false,
 *   idempotent: false,
 *   retrySafe: false,
 *   sideEffects: ['sends-email', 'creates-db-record'],
 *   typicalNext: ['/api/v1/users/{id}/verify'],
 *   errorGuidance: {
 *     '409': 'User already exists. Use GET /users?email= first.',
 *   },
 * })
 * createUser(@Body() dto: CreateUserDto) { ... }
 * ```
 */
export const AgenticMeta = (options: AgentMetaOptions) =>
  SetMetadata(AGENTIC_META_KEY, options);
