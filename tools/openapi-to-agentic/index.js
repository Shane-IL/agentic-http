#!/usr/bin/env node
/**
 * openapi-to-agentic
 *
 * Reads an OpenAPI 3.x spec (JSON or YAML) and generates agent-meta stubs
 * for every operation. Output is a JSON map of operationId (or method+path)
 * to a partially-filled agent-meta object that can be pasted into middleware.
 *
 * Usage:
 *   openapi-to-agentic openapi.yaml
 *   openapi-to-agentic openapi.json --format express
 *   openapi-to-agentic openapi.yaml --format fastapi
 *
 * NOTE: The intent field is stubbed with a placeholder derived from the
 * OpenAPI summary/description. For richer intent text, pipe the output
 * through an LLM (see README for example).
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// HTTP methods that OpenAPI defines as operations on a path item
const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'];

function fatal(msg) {
  console.error(`[openapi-to-agentic] error: ${msg}`);
  process.exit(2);
}

function printUsage() {
  console.log(`
Usage: openapi-to-agentic [options] <spec>

Generate Agentic-HTTP agent-meta stubs from an OpenAPI 3.x spec.

Arguments:
  spec          Path to an OpenAPI spec file (.json or .yaml/.yml)

Options:
  --format      Output format: json (default), express, fastapi
  --out <file>  Write output to file instead of stdout
  --help        Show this message

Formats:
  json      Raw JSON map of { "METHOD /path": { agent-meta stub } }
  express   JavaScript snippet — agenticHttp() call per route
  fastapi   Python snippet — @agentic_http() decorator per route

Examples:
  openapi-to-agentic openapi.yaml
  openapi-to-agentic openapi.json --format express --out stubs.js
  openapi-to-agentic openapi.yaml --format fastapi
`.trim());
}

// ---------------------------------------------------------------------------
// Heuristics for inferring agent-meta fields from OpenAPI operation metadata
// ---------------------------------------------------------------------------

/**
 * Infer the `effect` field from HTTP method and optional x-agentic-effect extension.
 */
function inferEffect(method, operation) {
  if (operation['x-agentic-effect']) return operation['x-agentic-effect'];
  switch (method.toUpperCase()) {
    case 'GET':
    case 'HEAD':
    case 'OPTIONS':
      return 'read';
    case 'DELETE':
      return 'delete';
    case 'POST':
      return 'write';
    case 'PUT':
    case 'PATCH':
      return 'write';
    default:
      return 'mixed';
  }
}

/**
 * Infer `idempotent` from HTTP method semantics.
 * PUT and DELETE are idempotent by HTTP spec; GET, HEAD, OPTIONS always are.
 * POST and PATCH typically are not.
 */
function inferIdempotent(method) {
  return ['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE'].includes(method.toUpperCase());
}

/**
 * Infer `retry-safe` — conservative: only safe for read-only methods.
 */
function inferRetrySafe(method) {
  return ['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
}

/**
 * Infer `reversible` — heuristic only; DELETE is rarely reversible.
 * Everything else defaults to unknown (false to be conservative).
 */
function inferReversible(method) {
  if (method.toUpperCase() === 'DELETE') return false;
  if (['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) return true;
  return false; // write/patch — needs human review
}

/**
 * Build a stub intent string from the operation summary or description.
 */
function buildIntent(operation, method, urlPath) {
  const base = operation.summary || operation.description;
  if (base && base.trim().length >= 10) {
    return base.trim();
  }
  // Fallback: generate from method + path
  const verb = {
    GET: 'Retrieves',
    POST: 'Creates',
    PUT: 'Replaces',
    PATCH: 'Updates',
    DELETE: 'Deletes',
  }[method.toUpperCase()] || 'Operates on';
  return `${verb} the resource at ${urlPath}. (TODO: expand this description)`;
}

/**
 * Extract error guidance from response codes defined in the operation.
 */
function buildErrorGuidance(operation) {
  const responses = operation.responses || {};
  const guidance = {};
  for (const [statusCode, response] of Object.entries(responses)) {
    if (!/^[45]\d{2}$/.test(statusCode)) continue;
    const desc = response.description || '';
    if (desc) {
      guidance[statusCode] = `${desc} (TODO: add agent-specific recovery instruction)`;
    }
  }
  return Object.keys(guidance).length > 0 ? guidance : undefined;
}

// ---------------------------------------------------------------------------
// Spec parsing
// ---------------------------------------------------------------------------

function loadSpec(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.json') {
    return JSON.parse(content);
  }
  if (ext === '.yaml' || ext === '.yml') {
    return yaml.load(content);
  }
  // Try JSON first, then YAML
  try {
    return JSON.parse(content);
  } catch {
    return yaml.load(content);
  }
}

function extractOperations(spec) {
  const paths = spec.paths || {};
  const operations = [];

  for (const [urlPath, pathItem] of Object.entries(paths)) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;

      const stub = {
        operationId: operation.operationId || `${method.toUpperCase()} ${urlPath}`,
        method: method.toUpperCase(),
        path: urlPath,
        tags: operation.tags || [],
        summary: operation.summary || '',
        'agent-meta': {
          version: '1.0',
          intent: buildIntent(operation, method, urlPath),
          effect: inferEffect(method, operation),
          reversible: inferReversible(method),
          idempotent: inferIdempotent(method),
          'retry-safe': inferRetrySafe(method),
        },
      };

      const errorGuidance = buildErrorGuidance(operation);
      if (errorGuidance) {
        stub['agent-meta']['error-guidance'] = errorGuidance;
      }

      operations.push(stub);
    }
  }

  return operations;
}

// ---------------------------------------------------------------------------
// Output formatters
// ---------------------------------------------------------------------------

function formatJson(operations) {
  const out = {};
  for (const op of operations) {
    out[`${op.method} ${op.path}`] = op['agent-meta'];
  }
  return JSON.stringify(out, null, 2);
}

function formatExpress(operations) {
  const lines = [
    '// Generated by openapi-to-agentic — review and complete TODOs before shipping',
    "const { agenticHttp } = require('@agentic-http/express');",
    '',
  ];

  for (const op of operations) {
    const meta = op['agent-meta'];
    lines.push(`// ${op.operationId}`);
    lines.push(`router.${op.method.toLowerCase()}('${op.path}', agenticHttp({`);
    lines.push(`  intent: ${JSON.stringify(meta.intent)},`);
    lines.push(`  effect: '${meta.effect}',`);
    lines.push(`  reversible: ${meta.reversible},`);
    lines.push(`  idempotent: ${meta.idempotent},`);
    lines.push(`  'retry-safe': ${meta['retry-safe']},`);
    if (meta['error-guidance']) {
      lines.push(`  'error-guidance': ${JSON.stringify(meta['error-guidance'], null, 2).replace(/\n/g, '\n  ')},`);
    }
    lines.push('}), /* your handler here */);');
    lines.push('');
  }

  return lines.join('\n');
}

function formatFastapi(operations) {
  const lines = [
    '# Generated by openapi-to-agentic — review and complete TODOs before shipping',
    'from agentic_http import agentic_http',
    '',
  ];

  for (const op of operations) {
    const meta = op['agent-meta'];
    const pyPath = op.path.replace(/{([^}]+)}/g, '{$1}');
    lines.push(`# ${op.operationId}`);
    lines.push(`@app.${op.method.toLowerCase()}("${pyPath}")`);
    lines.push('@agentic_http(');
    lines.push(`    intent=${JSON.stringify(meta.intent)},`);
    lines.push(`    effect="${meta.effect}",`);
    lines.push(`    reversible=${meta.reversible ? 'True' : 'False'},`);
    lines.push(`    idempotent=${meta.idempotent ? 'True' : 'False'},`);
    lines.push(`    retry_safe=${meta['retry-safe'] ? 'True' : 'False'},`);
    if (meta['error-guidance']) {
      const guidance = JSON.stringify(meta['error-guidance'], null, 4).replace(/\n/g, '\n    ');
      lines.push(`    error_guidance=${guidance},`);
    }
    lines.push(')');
    lines.push('async def handler(request: Request):');
    lines.push('    ...  # TODO: implement');
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const formatIdx = args.indexOf('--format');
  const format = formatIdx !== -1 ? args[formatIdx + 1] : 'json';
  if (!['json', 'express', 'fastapi'].includes(format)) {
    fatal(`Unknown format: ${format}. Use json, express, or fastapi.`);
  }

  const outIdx = args.indexOf('--out');
  const outFile = outIdx !== -1 ? args[outIdx + 1] : null;

  const positional = args.filter((a, i) => {
    if (a.startsWith('--')) return false;
    if (i > 0 && (args[i - 1] === '--format' || args[i - 1] === '--out')) return false;
    return true;
  });

  if (positional.length === 0) {
    printUsage();
    process.exit(2);
  }

  const specPath = positional[0];
  if (!fs.existsSync(specPath)) {
    fatal(`File not found: ${specPath}`);
  }

  let spec;
  try {
    spec = loadSpec(specPath);
  } catch (err) {
    fatal(`Cannot parse spec: ${err.message}`);
  }

  const operations = extractOperations(spec);
  if (operations.length === 0) {
    console.error('[openapi-to-agentic] warning: no operations found in spec');
  } else {
    console.error(`[openapi-to-agentic] found ${operations.length} operation(s)`);
  }

  let output;
  if (format === 'json') output = formatJson(operations);
  else if (format === 'express') output = formatExpress(operations);
  else output = formatFastapi(operations);

  if (outFile) {
    fs.writeFileSync(outFile, output, 'utf8');
    console.error(`[openapi-to-agentic] written to ${outFile}`);
  } else {
    process.stdout.write(output + '\n');
  }
}

main();
