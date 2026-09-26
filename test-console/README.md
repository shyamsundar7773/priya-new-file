# Priya Test Console

The Priya Test Console is an independent developer/testing system for controlling,
observing, recording, and evaluating the Priya Companion application. It is not
the Priya application, the frozen reference, or the historical QA Lab.

Prompt 0 establishes contracts only. Integrations with the real app, semantic AI,
native capabilities, and fixture providers are intentionally incomplete.

## Boundaries

- `src/contracts.ts` contains the shared domain model and status taxonomy.
- `src/validation.ts` enforces isolation, evidence, and false-pass rules.
- `src/console.ts` is the minimal console orchestration boundary.
- `src/contract-tests.ts` verifies the first vertical-slice contract without
  claiming that the real Priya workflow works.
- `docs/ARCHITECTURE.md` documents component boundaries and evidence flow.

## Safe commands

From the repository root:

```powershell
npx tsc -p test-console/tsconfig.json
node test-console/dist/contract-tests.js
```

The generated `test-console/dist` directory is ignored by the package-local
`.gitignore`. No command here builds an APK, starts Expo, or runs the old QA Lab.

## Extension rules for future prompts

1. Add a concrete adapter behind an existing contract; do not couple the console
   to Priya application internals.
2. Record evidence before evaluating an expectation.
3. Keep deterministic evidence separate from semantic or visual interpretation.
4. Return `NOT_PROVEN`, `BLOCKED`, or `NATIVE_DEFERRED` when a requirement cannot
   be verified in the active environment.
5. Never turn an AI opinion or a screen-only observation into `PASS`.
6. Any app repair is owned by the developer/Copilot workflow, never by the agent.

