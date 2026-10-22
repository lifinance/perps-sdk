# Agent Instructions

## Language

Read `LANGUAGE.md` before you write any text. The rules apply to all written text, except code, code comments, and code identifiers.

@LANGUAGE.md

## Code Quality

Do not make a change only to make a problem go away. Do not use hacks, lint suppressions, or incorrect type casts.

Before you propose a change, ask: does this problem show an error or a gap in the model? If yes, think about the problem at a higher level. Ask the user if necessary.

## 1. Think Before Coding

Do not assume. Do not hide confusion. Show the tradeoffs.

Before you write code:
- State your assumptions. If you are not sure, ask.
- If the request has more than one meaning, show the meanings. Do not choose one silently.
- If a simpler approach exists, say so. Disagree when you have a reason.
- If something is not clear, stop. Name the part that is not clear. Ask.

## 2. Simplicity First

Write the minimum code that solves the problem. Do not write speculative code.

- Do not add features that the user did not ask for.
- Do not add an abstraction for code that has one use.
- Do not add flexibility or configuration that the user did not ask for.
- Do not add error handling for a condition that cannot occur.
- If you write 200 lines and 50 lines can do the same work, write it again.

Ask: "Does a senior engineer think that this is too complex?" If yes, make it simpler.

## 3. Surgical Changes

Change only the code that you must change. Remove only the unused code that your change makes.

When you edit code:
- Do not change adjacent code, comments, or formatting.
- Do not refactor code that works.
- Use the style of the existing code, also when you prefer a different style.
- If you find unrelated dead code, tell the user. Do not delete it.

When your change makes code unused:
- Remove the imports, variables, and functions that your change made unused.
- Do not remove dead code that existed before your change, unless the user asks.

The test: each changed line must trace to the user's request.

## 4. Goal-Driven Execution

Define the success criteria. Repeat the work until you verify them.

Change each task into a goal that you can verify:
- "Add validation" → "Write tests for invalid inputs, then make them pass."
- "Fix the bug" → "Write a test that shows the bug, then make it pass."
- "Refactor X" → "Make sure that the tests pass before and after."

For a task with many steps, state a short plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

## Comments

A comment documents behavior that is not obvious. It documents nothing else. By default, write no comment.

### Allowed

- A short comment (one line, two lines maximum) about a hidden constraint, a subtle invariant, a workaround for a specific upstream bug, or behavior that surprises a careful reader.
- TSDoc or JSDoc on an exported symbol (function, class, interface, type): a one-line summary, plus any contract that the type cannot express.
  - A doc comment documents the symbol. It does not need a tag for each parameter or property.
  - Document a `@param` or a property only when it adds information that the name and type do not give: units, range, default, side effect, ownership, or the meaning of an opaque value.
- A `TODO:` or `POTENTIAL BUG:` marker, per the repo conventions.

### Not allowed

- **History comments.** Do not write "previously this was X", "used to be Y", "renamed from Z", "replaces the old W", "after the refactor", or "now uses". `git log` and the PR body hold the history.
- **Ticket references in source.** Do not write ticket numbers in code or comments. Ticket numbers go in PR bodies and commit messages.
- **Caller pointers.** Do not write "used by", "called from", or "for the X flow". Identifiers and search show the callers, and the pointer becomes wrong when a caller changes.
- **Comments that repeat the code.** If a comment says the same thing as the next line, delete the comment. This includes doc tags that repeat the name and type, for example `/** Order side */` on `side: OrderSide`.
- **Long block comments.** Do not write a block comment of more than 5 lines at the top of a function or file. If a function needs that much text, make the function simpler.
- **Summary blocks** at the end of a file that repeat what the file defines.

### When you are not sure

Delete the comment. If the reason for the code is important, put it in the commit message or the PR body.

## Tests

- Write tests only for the current behavior.
- Do not write a test that proves the absence of removed behavior.

If you cannot run a live, authenticated integration test, do not stop the work. Examples: no signed auth token, no funded test wallet, no OAuth grant, or an upstream API that is not open to you. This is a gap in the integration tests, and a human closes it later.

- Mock the external HTTP or network boundary in a unit test.
- Use fixtures with realistic shapes. Take the shapes from the upstream's OpenAPI spec, SDK, or docs.
- Do not mock the code under test.
- In the PR body's `## Assumptions` section, name each live check that you did not do.

## Files That You Never Commit

- **Local dependency paths.** Commit only the original relative `link:../` paths in `package.json`. Never commit an absolute or machine-specific `link:` or `file:` path. If you changed a path for local work, run `git checkout -- package.json` before you commit.
- **Working notes.** Never commit design docs, implementation plans, research notes, brainstorm output, or other agent notes. Examples: `docs/superpowers/`, `docs/plans/`, `docs/specs/`, `*-design.md`, and scratch files named after a ticket.
  - Write working notes to the session scratchpad directory.
  - If a plan must be kept and shared, put it in the issue or the PR body.
  - Before each commit, run `git status` and remove working notes from the index.

## Updating an Open PR

To add changes to an open PR, add a new commit on top of the branch and push it. Do not rebase the PR branch onto the trunk only to make it current. A rebase changes the commit hashes, needs a force push, and breaks the review anchors.

Rebase only in these two cases:
1. The trunk has a change that conflicts with the branch, and the conflict must be resolved at the commit level.
2. The user asks for a clean history.

If the trunk has a conflicting change, tell the user before you change the PR history. Do not force-push without the user's approval.

## Commit Messages and PR Bodies

- Do not add a `Co-Authored-By` trailer or other co-author lines to a commit message.
- Do not add a "Generated with" line to a PR body.

## Linear

- Use only `save_comment` to write to a Linear issue.
- Do not change the status, assignee, priority, labels, or other fields of an issue, unless the user asks.
- Change the status after the merge and the tests, not at commit time.
- A skill can give a wider permission. That permission applies only in that skill and its sub-agents.

---

# Additional Repository Rules

The Perps SDK is a TypeScript SDK for perpetual futures trading (`@lifi/perps-sdk`). [README.md](./README.md) describes the usage. The [full docs](https://public-perps-docs.mintlify.app/) give more information.

## Node Version

Before you run a command or start a sub-agent, use the correct Node version. Read the `engines` field in `package.json`. If the field does not exist, use Node 24.

```bash
nvm use 24  # or whichever version satisfies the engines field
```

## Commands

```bash
pnpm build           # Build CJS + ESM + types
pnpm test            # Run all tests (vitest)
pnpm test:unit       # Unit tests only
pnpm check           # Biome lint/format check
pnpm check:write     # Biome auto-fix
pnpm check:types     # TypeScript type checking
pnpm knip:check      # Unused deps/exports check
```

## Conventions

- Use Biome for lint and format. Do not use ESLint.
- Put a unit test next to its source file. Name the test `FILENAME.unit.spec.ts`.
- The SDK packages use `@lifi/perps-types` from `packages/perps-types` in this monorepo (`workspace:^`).

## Documentation

After you complete a feature or a large change, read README.md again. Tell the user about each part that is not correct.

## Commits

- Write each commit message on one line, in the Conventional Commits format.
- Do not put a scope before the colon. Write `feat: add X`, not `feat(module): add X`.
- If the commit resolves a Linear issue, add a comment with the fix details to the issue. Then add `(ORD-<id>)` to the end of the commit message.
