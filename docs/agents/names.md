## Function Names

The verb at the start of a function name tells the type of change that the function does.

- Read the verb table in `packages/perps-sdk/README.md` § Vocabulary before you name a function.
- Use only a verb from that table.
- Do not use the verbs `derive`, `predict`, or `convert`.
- Do not use a noun alone as a function name.
- Do not add an exception to `NAMING_EXCEPTIONS` in `packages/perps-sdk/src/index.boundary.unit.spec.ts`. The list must stay empty.
- If you add a verb, add it to `VOCABULARY` in the spec and to the README table in the same commit.

Note: the spec checks the function names in `decimal/`, `math/`, and `wire/` only. Use the same verbs in all other folders.

## Names of Constants and Types

- The name of a constant must tell what it is and where it is used.
- A message constant has the name of its enum member, for example `ORDER_SUBMITTED_MESSAGE`.
- Do not write a one-line wrapper function for an enum compare. Write the compare in the code.
- Give a shared base type the name `<Name>Base`.
