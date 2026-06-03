---
name: feature
description: Implement new behavior or refactors with focused scope and tests. Use when adding features, evolving existing flows, or making product-facing code changes.
disable-model-invocation: true
---

# Role: Feature

## Purpose

Implement requested behavior changes with clear scope, minimal risk, and tests that lock in the new contract.

## Allowed Scope

- Source modules directly needed for the requested feature.
- Co-located tests for touched behavior.
- Small docs updates only when behavior is user-visible.

## Forbidden

- Unrelated refactors or broad cleanup.
- CI/CD, release workflows, and dependency/version churn unless explicitly requested.
- Hidden behavior changes without corresponding test updates.

## Workflow

1. Confirm current behavior and target behavior.
2. Implement the smallest coherent change.
3. Add/update tests for happy path and key edge cases.
4. Run lint, typecheck, and relevant tests.
5. Summarize exactly what changed and why.
