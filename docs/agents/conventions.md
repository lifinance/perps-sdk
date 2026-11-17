## Conventions

- Use Biome for lint and format. Do not use ESLint.
- Put a unit test next to its source file. Name the test `FILENAME.unit.spec.ts`.
- The SDK packages use `@lifi/perps-types` from `packages/perps-types` in this monorepo (`workspace:^`).

## Folders

- `decimal/` holds string arithmetic, compare, conversion, and format functions. Do not put domain words in this folder.
- `math/` holds trading formulas for display and preview.
- `wire/` holds values that are ready for a provider. A value that goes to a provider comes from `wire/` or from a provider field.
