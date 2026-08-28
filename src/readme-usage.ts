import { runCli } from './cli/standalone.js';

/***
 * Provider and CLI surface
 *
 * `@ankhorage/doctor` is the repo/package compliance provider for Ankhorage.
 *
 * The same shared command implementation backs both:
 *
 * - `ankh doctor ...`
 * - `bunx @ankhorage/doctor ...`
 *
 * Current command surface:
 *
 * - `validate`
 * - `fix`
 * - `repo`
 * - `package`
 *
 * `doctor#2` adds a profile-based policy engine:
 *
 * - strict `public-package` validation for extracted public package repos
 * - light recognized `integration-monorepo` validation for `ankhorage4`
 * - canonical app-manifest authentication validation for JSON file targets
 * - non-mutating `fix` plans for deterministic mechanical changes only
 *
 * Public-package script validation follows the canonical Devtools contract. In particular,
 * packages must expose `knip:check`; the obsolete `knip` script does not satisfy that policy.
 * During the Devtools-owned Changesets bootstrap, `@ankhorage/devtools` must publish
 * `@changesets/cli` from `dependencies`; current consumers keep it only in `devDependencies`
 * until the released Devtools synchronization contract can produce the final consumer state.
 *
 * Manifest validation accepts `infra.auth.flow` as the only auth-flow location, rejects
 * `settings.authFlow` with a manual-migration diagnostic, and permits authentication without
 * an authorization block.
 *
 * Still deferred:
 *
 * - GitHub checks
 * - CI checks
 * - on-disk `fix --apply`
 * - deeper cross-repo policy enforcement
 *
 * Path handling:
 *
 * - pass a repo/package directory or app-manifest JSON file as `[path]`, or
 * - omit it to inspect the current working directory
 *
 * @usage
 */
await runCli(['--help']);
