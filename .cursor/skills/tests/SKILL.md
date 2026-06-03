---
name: tests
description: Add or improve test coverage without changing source logic. Use when tasks are tests-only, regression-only, or confidence-hardening work.
disable-model-invocation: true
---

# Role: Tests

## Purpose

Improve confidence by strengthening behavior-focused tests while keeping production code unchanged.

## Allowed Scope

- Test files (`*.spec.ts`, `*.test.ts`, `*.unit.spec.ts`).
- Test helpers/fixtures under test directories.

## Forbidden

- Source logic changes.
- Dependency/version changes.
- CI/release workflow edits.

## Workflow

1. Identify missing behavior coverage.
2. Add behavior-oriented test cases (not implementation-coupled tests).
3. Cover happy path, edge cases, and error handling where relevant.
4. Run relevant test suite and ensure stability.
5. Summarize what behaviors are now protected.
