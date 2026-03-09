#!/usr/bin/env node
/**
 * agentic-http validator CLI
 *
 * Validates an agent-meta object against the Agentic-HTTP JSON Schema.
 * Reads from a file path or stdin. Exits non-zero on failure.
 *
 * Usage:
 *   agentic-validate response.json
 *   cat response.json | agentic-validate
 *   agentic-validate --meta-only agent-meta.json
 */

const fs = require('fs');
const path = require('path');
const Ajv = require('ajv/dist/2020');
const addFormats = require('ajv-formats');

const SCHEMA_PATH = path.resolve(__dirname, '../../spec/schema.json');

function loadSchema() {
  try {
    return JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  } catch (err) {
    fatal(`Cannot load schema from ${SCHEMA_PATH}: ${err.message}`);
  }
}

function fatal(msg) {
  console.error(`[agentic-validate] error: ${msg}`);
  process.exit(2);
}

function printUsage() {
  console.log(`
Usage: agentic-validate [options] [file]

Validates an Agentic-HTTP agent-meta object against the spec schema.

Arguments:
  file        Path to a JSON file. Omit to read from stdin.

Options:
  --meta-only  Input is a bare agent-meta object (not a full response envelope)
  --quiet      Suppress output on success; only print errors
  --help       Show this message

Exit codes:
  0  Valid
  1  Validation failed
  2  Usage error (bad input, missing file, etc.)

Examples:
  agentic-validate response.json
  cat response.json | agentic-validate
  agentic-validate --meta-only agent-meta.json
`.trim());
}

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => chunks.push(chunk));
    process.stdin.on('end', () => resolve(chunks.join('')));
    process.stdin.on('error', reject);
  });
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    process.exit(0);
  }

  const metaOnly = args.includes('--meta-only');
  const quiet = args.includes('--quiet');
  const positional = args.filter(a => !a.startsWith('--'));
  const filePath = positional[0];

  // Read input
  let raw;
  if (filePath) {
    if (!fs.existsSync(filePath)) {
      fatal(`File not found: ${filePath}`);
    }
    try {
      raw = fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      fatal(`Cannot read file: ${err.message}`);
    }
  } else {
    if (process.stdin.isTTY) {
      printUsage();
      process.exit(2);
    }
    raw = await readStdin();
  }

  // Parse JSON
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    fatal(`Invalid JSON: ${err.message}`);
  }

  // Extract agent-meta
  let agentMeta;
  if (metaOnly) {
    agentMeta = parsed;
  } else {
    if (typeof parsed !== 'object' || parsed === null || !('agent-meta' in parsed)) {
      fatal('No "agent-meta" key found. Use --meta-only if the input is a bare agent-meta object.');
    }
    agentMeta = parsed['agent-meta'];
  }

  // Validate
  const schema = loadSchema();
  const ajv = new Ajv({ strict: true, allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const valid = validate(agentMeta);

  if (valid) {
    if (!quiet) {
      console.log('[agentic-validate] ok — agent-meta is valid (Agentic-HTTP 1.0)');
    }
    process.exit(0);
  } else {
    console.error('[agentic-validate] INVALID — agent-meta failed schema validation\n');
    for (const err of validate.errors) {
      const loc = err.instancePath || '(root)';
      console.error(`  ${loc}: ${err.message}`);
      if (err.params && Object.keys(err.params).length > 0) {
        console.error(`    ${JSON.stringify(err.params)}`);
      }
    }
    process.exit(1);
  }
}

main().catch(err => fatal(err.message));
