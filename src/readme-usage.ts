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
 * `doctor#1` intentionally stays lightweight:
 *
 * - path-aware local repo/package diagnostics are implemented now
 * - GitHub checks, CI checks, full policy enforcement, and autofix rules are deferred
 *
 * Path handling:
 *
 * - pass `[path]`, or
 * - omit it to inspect the current working directory
 *
 * @usage
 */
await runCli(['--help']);
