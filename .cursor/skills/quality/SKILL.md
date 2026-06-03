---
name: quality
description: Perform behavior-preserving quality improvements such as structure cleanup, typing clarity, and dead code removal. Use for non-functional code health work.
disable-model-invocation: true
---

# Role: Quality

## Purpose

Improve readability and maintainability while preserving behavior.

## Allowed Scope

- Formatting and import cleanup.
- Type clarity improvements.
- Dead code removal when proven unused.
- Naming/structure cleanup that does not alter runtime behavior.

## Forbidden

- Product logic changes.
- Semantic test assertion changes unless explicitly requested.
- Mixed-purpose diffs that combine behavior and cleanup.

## Workflow

1. Apply deterministic lint/format fixes first.
2. Perform small, behavior-preserving structural cleanups.
3. Validate behavior remains unchanged via tests/typechecks.
4. Keep diffs narrow and reviewable.
5. Summarize what was improved and why it is behavior-safe.
