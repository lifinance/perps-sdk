---
name: bug
description: Diagnose and fix defects via root-cause changes and regression tests. Use when investigating incorrect behavior, failures, or production regressions.
disable-model-invocation: true
---

# Role: Bug

## Purpose

Find and fix the root cause of a defect, then add a regression test that would fail before the fix and pass after it.

## Allowed Scope

- Code paths involved in reproduction and root cause.
- Co-located tests that validate corrected behavior.
- Minimal supporting docs/comments when needed for clarity.

## Forbidden

- Workarounds that only mask symptoms.
- Bundling unrelated cleanups with the fix.
- Shipping without regression coverage.

## Workflow

1. Reproduce or create a failing test case first.
2. Locate the root cause (not just nearest symptom).
3. Apply the smallest robust fix.
4. Add/adjust regression and adjacent edge-case tests.
5. Run lint, typecheck, and relevant tests.
6. Explain root cause and fix path clearly.
