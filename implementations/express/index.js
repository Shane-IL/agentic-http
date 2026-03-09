/**
 * agentic-http — Express.js middleware
 * https://agentic-http.dev
 *
 * Detects X-Agent-Client headers and appends agent-meta to JSON responses.
 *
 * Usage:
 *   const { agenticHttp, wellKnown } = require('agentic-http/express');
 *
 *   // Per-route metadata
 *   router.delete('/users/:id', agenticHttp({
 *     intent: 'Permanently deletes a user account and all associated data.',
 *     effect: 'delete',
 *     reversible: false,
 *     idempotent: true,
 *     'retry-safe': false,
 *     'side-effects': ['purges-storage', 'cancels-subscriptions', 'sends-email'],
 *     preconditions: ['User must have no active paid subscriptions'],
 *     'typical-next': ['/api/v1/audit-log'],
 *     'error-guidance': {
 *       '409': 'Active subscription exists. Call DELETE /api/v1/subscriptions/{id} first.',
 *       '404': 'User not found. Verify ID before retrying.'
 *     }
 *   }), deleteUserHandler);
 *
 *   // Well-known discovery endpoint
 *   app.use(wellKnown({ description: 'Acme Corp API v2' }));
 */

const SUPPORTED_VERSION = '1.0';

/**
 * Returns true if the request is from an Agentic-HTTP compliant agent caller.
 */
function isAgentRequest(req) {
  return req.headers['x-agent-client'] === 'true'
    && req.headers['x-agent-protocol'] !== undefined;
}

/**
 * Returns true if the caller has the agentic:read OAuth scope.
 * Override this with your own scope extraction logic.
 */
function hasAgenticScope(req) {
  // Default: check req.auth.scope (compatible with express-oauth2-jwt-bearer)
  // Override by passing a custom `checkScope` function to agenticHttp()
  const scope = req.auth?.payload?.scope || req.user?.scope || '';
  return scope.split(' ').includes('agentic:read');
}

/**
 * Middleware factory. Pass the agent-meta fields for this endpoint.
 *
 * @param {object} meta - agent-meta fields (intent, effect, reversible, idempotent, retry-safe, ...)
 * @param {object} [options]
 * @param {function} [options.checkScope] - Custom scope checker: (req) => boolean
 */
function agenticHttp(meta, options = {}) {
  const checkScope = options.checkScope || hasAgenticScope;

  // Validate required fields at startup, not at runtime
  const required = ['intent', 'effect', 'reversible', 'idempotent', 'retry-safe'];
  for (const field of required) {
    if (meta[field] === undefined) {
      throw new Error(`[agentic-http] Missing required field: ${field}`);
    }
  }

  const agentMeta = {
    version: SUPPORTED_VERSION,
    ...meta
  };

  return function agenticHttpMiddleware(req, res, next) {
    if (!isAgentRequest(req) || !checkScope(req)) {
      return next();
    }

    // Intercept res.json to append agent-meta
    const originalJson = res.json.bind(res);
    res.json = function(data) {
      // Don't append to error responses or non-object payloads
      if (res.statusCode >= 400 || typeof data !== 'object' || data === null) {
        return originalJson(data);
      }
      return originalJson({ ...data, 'agent-meta': agentMeta });
    };

    next();
  };
}

/**
 * Mounts the /.well-known/agentic-http.json discovery endpoint.
 *
 * @param {object} config
 * @param {string} config.description - Human-readable API description
 * @param {object} [config.endpoints] - Map of path -> { methods: string[] }
 */
function wellKnown(config = {}) {
  const { Router } = require('express');
  const router = Router();

  router.get('/.well-known/agentic-http.json', (req, res) => {
    res.json({
      'agentic-http-version': SUPPORTED_VERSION,
      description: config.description || '',
      endpoints: config.endpoints || {}
    });
  });

  return router;
}

module.exports = { agenticHttp, wellKnown, isAgentRequest, hasAgenticScope };
