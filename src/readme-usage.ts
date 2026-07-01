import { runCli } from './cli.js';

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
 * - non-mutating `fix` plans for deterministic mechanical changes only
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
 * - pass `[path]`, or
 * - omit it to inspect the current working directory
 *
 * @usage
 */
await runCli(['--help']);
