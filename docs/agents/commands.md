## Node Version

Before you run a command or start a sub-agent, use the correct Node version. Read the `engines` field in `package.json`. If the field does not exist, use Node 26.

```bash
nvm use 26  # or whichever version satisfies the engines field
```

## Commands

```bash
pnpm build           # Build CJS + ESM + types
pnpm test            # Run all tests (vitest)
pnpm test:unit       # Unit tests only
pnpm test:affected   # Fast loop: only tests affected since the last run
pnpm test:changed    # Unit tests that import a file changed since origin/main
pnpm check           # Biome lint/format check
pnpm check:write     # Biome auto-fix
pnpm check:types     # TypeScript type checking
pnpm knip:check      # Unused deps/exports check
```

Use `pnpm test:affected` for the fast loop. Run `pnpm test:changed` before you push, not the full `pnpm test`. The `pre-push` hook runs `pnpm test:changed`.

`pnpm test:changed` runs only the unit specs that import a file changed since `origin/main`. If you change one of these items, run the full suites with `pnpm test`:

- A dependency version.
- A `package.json` file.
- The lockfile, `pnpm-lock.yaml`.
- A `vitest.config.ts` file.
- `vitest.shared.ts`.
- A test setup file, for example `packages/perps-sdk/test/setup.ts`.
- A file that tests read from disk, for example a fixture or `packages/perps-sdk-provider-lighter/wasm/lighter-signer.wasm`.

Note: no spec imports these files. Vitest runs all specs after a change to a `package.json` or `vitest.config.ts` file. After a change to the other files, `pnpm test:changed` can skip a spec that the change breaks. CI runs the full suites on each PR.
