import { bunRuntimePolicy } from '@ankhorage/devtools/policy';
import { describe, expect, test } from 'bun:test';

import { analyzeDoctorTarget } from '../src/index.js';
import { createDoctorFixture } from './testSupport.js';

const BUN_POLICY_RULE_IDS = [
  'package.json.package-manager.policy',
  'package.dependencies.types-bun.policy',
  'repo.workflows.ci.bun-policy',
  'repo.workflows.release.bun-policy',
] as const;

describe('Bun runtime policy', () => {
  test('reports each managed Bun drift location with one repair command', async () => {
    const fixture = await createDoctorFixture({
      packageJson: createPublicPackageJson('bun@0.0.0', '^0.0.0'),
      extraFiles: createWorkflowFiles('0.0.0'),
    });

    const result = await analyzeDoctorTarget({ cwd: fixture, mode: 'validate' });
    const diagnostics = result.diagnostics.filter((diagnostic) =>
      BUN_POLICY_RULE_IDS.includes(diagnostic.ruleId as (typeof BUN_POLICY_RULE_IDS)[number]),
    );

    expect(diagnostics.map((diagnostic) => diagnostic.ruleId).sort()).toEqual(
      [...BUN_POLICY_RULE_IDS].sort(),
    );
    for (const diagnostic of diagnostics) {
      expect(diagnostic.message).toContain('expected');
      expect(diagnostic.message).toContain('found');
      expect(diagnostic.message).toContain('ankh devtools sync');
    }
  });

  test('accepts repository state synchronized to the Devtools Bun policy', async () => {
    const fixture = await createDoctorFixture({
      packageJson: createPublicPackageJson(
        bunRuntimePolicy.packageManager,
        bunRuntimePolicy.typesRange,
      ),
      extraFiles: createWorkflowFiles(bunRuntimePolicy.version),
    });

    const result = await analyzeDoctorTarget({ cwd: fixture, mode: 'validate' });
    const ruleIds = result.diagnostics.map((diagnostic) => diagnostic.ruleId);

    for (const ruleId of BUN_POLICY_RULE_IDS) {
      expect(ruleIds).not.toContain(ruleId);
    }
  });

  test('reports missing managed workflow Bun state as repairable drift', async () => {
    const fixture = await createDoctorFixture({
      packageJson: createPublicPackageJson(
        bunRuntimePolicy.packageManager,
        bunRuntimePolicy.typesRange,
      ),
      extraFiles: {
        '.github/workflows/ci.yml': 'name: CI\n',
      },
    });

    const result = await analyzeDoctorTarget({ cwd: fixture, mode: 'validate' });
    const workflowDiagnostics = result.diagnostics.filter((diagnostic) =>
      diagnostic.ruleId.startsWith('repo.workflows.') && diagnostic.ruleId.endsWith('.bun-policy'),
    );

    expect(workflowDiagnostics).toHaveLength(2);
    expect(workflowDiagnostics.every((diagnostic) => diagnostic.message.includes('ankh devtools sync'))).toBe(
      true,
    );
  });
});

function createWorkflowFiles(version: string): Readonly<Record<string, string>> {
  const workflow = (name: string) => `name: ${name}\n\njobs:\n  validate:\n    steps:\n      - uses: oven-sh/setup-bun@v2\n        with:\n          bun-version: '${version}'\n`;
  return {
    '.github/workflows/ci.yml': workflow('CI'),
    '.github/workflows/release.yml': workflow('Release'),
  };
}

function createPublicPackageJson(
  packageManager: string,
  bunTypes: string,
): Record<string, unknown> {
  return {
    name: '@ankhorage/example',
    version: '1.0.0',
    description: 'Doctor Bun policy fixture',
    license: 'MIT',
    type: 'module',
    repository: { type: 'git', url: 'git+https://github.com/ankhorage/example.git' },
    homepage: 'https://github.com/ankhorage/example#readme',
    bugs: { url: 'https://github.com/ankhorage/example/issues' },
    keywords: ['ankhorage'],
    files: ['dist'],
    exports: { '.': './dist/index.js' },
    publishConfig: { access: 'public' },
    packageManager,
    scripts: {
      build: 'echo build',
      typecheck: 'echo typecheck',
      lint: 'ankhorage-eslint . --max-warnings=0',
      'lint:fix': 'ankhorage-eslint . --fix --max-warnings=0',
      format: 'ankhorage-prettier --write .',
      'format:check': 'ankhorage-prettier --check .',
      test: 'bun test',
      knip: 'ankhorage-knip',
      docs: 'echo docs',
      changeset: 'changeset',
      'changeset:status': 'changeset status --since=origin/main',
      'version-packages': 'changeset version',
    },
    devDependencies: {
      typescript: '^5.9.3',
      '@changesets/cli': '^2.31.0',
      '@types/bun': bunTypes,
      '@types/node': '^25.6.0',
      '@ankhorage/devtools': '^1.4.1',
    },
  };
}
