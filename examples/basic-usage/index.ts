import { runCli } from '../../src/cli/standalone.js';

/***
 * @title Basic Usage
 *
 * `@ankhorage/doctor` validates Ankhorage repositories, packages, and app manifests through the
 * same command implementation exposed by both `ankh doctor ...` and the standalone package CLI.
 *
 * Use `validate` for the canonical read-only checks, or target the narrower `repo` and `package`
 * surfaces when only one policy area should be inspected.
 *
 * @usage
 * @readme
 */
await runCli(['--help']);
