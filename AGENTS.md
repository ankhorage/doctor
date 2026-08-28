# AGENTS.md

## Scope

This file applies to the whole `ankhorage/doctor` repository.

`@ankhorage/doctor` owns executable repository, package, and application-manifest compliance diagnostics. Keep policy checks deterministic and non-mutating unless a command explicitly applies a safe fix. Shared tooling policy remains owned by `@ankhorage/devtools`.

## Devtools lint migration

`eslint.local.config.mjs` contains exact-file exceptions for size, complexity, and object-injection findings that existed before the current Devtools profile was synchronized. Treat those exceptions as existing debt:

- new or materially modified code must satisfy the canonical Devtools rules;
- do not broaden an exception to land unrelated work;
- remove an exception when the owning file is brought within the canonical rule;
- keep tests and `paradox.config.ts` covered by the shared TypeScript profile.

## Package boundary

- Keep Doctor policy behavior in `src/` and focused tests in `tests/`.
- Do not duplicate Devtools-managed policy or generated configuration.
- Do not add compatibility aliases or dual old/new policy paths.
- Public behavior changes require tests, generated Paradox documentation where applicable, and a changeset.

## Validation

Run the repository scripts for build, lint, tests, Knip, typecheck, format, docs, and changeset status. Validate the built standalone CLI against the repository before handoff.
