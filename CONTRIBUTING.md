# Contributing to Agentic-HTTP

Thanks for your interest in contributing.

## What We're Looking For

- **Spec feedback**: Ambiguities, gaps, or problems in the spec itself
- **Reference implementations**: New languages/frameworks (Rails, Go, .NET, etc.)
- **Real-world testing**: Feedback from implementing against an actual API
- **Edge cases**: Scenarios the current spec doesn't handle well (streaming, webhooks, etc.)

## How to Contribute

1. **For spec changes**: Open an issue first and describe the problem. Large spec changes need discussion before a PR.
2. **For implementations**: Follow the existing Express or FastAPI implementations as a reference. Each implementation must pass the validator test suite.
3. **For documentation**: PRs welcome without prior issue.

## Spec Change Process

Spec changes are categorized as:

- **Editorial** (typos, clarifications): PR directly
- **Non-breaking additive** (new optional field, new discovery mechanism): Issue + PR
- **Breaking** (removes or renames required fields, changes semantics): RFC document required — see `rfcs/` directory

## Code Style

- Implementations should be idiomatic for their language/framework
- No unnecessary dependencies
- Must include a README with installation and usage instructions
- Must include at least basic tests

## Governance

The spec is maintained by a small steering committee. Membership is open to organizations with a production Agentic-HTTP implementation. See `GOVERNANCE.md` for details.

## CLA

All contributors must sign the Contributor License Agreement before their first PR is merged. The CLA bot will prompt you automatically.
