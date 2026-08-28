import { describe, expect, test } from 'bun:test';

import { analyzeDoctorTarget } from '../src/index.js';
import { createDoctorFixture } from './testSupport.js';

describe('public package script policy', () => {
  test('accepts the Devtools 1.7.0 knip:check contract', async () => {
    const fixture = await createDoctorFixture({
      packageJson: createPublicPackageJson({
        'knip:check': 'ankhorage-knip',
      }),
      withChangelog: true,
      withChangeset: true,
      withLicense: true,
      withReadme: true,
      withWorkflows: true,
    });

    const result = await analyzeDoctorTarget({ cwd: fixture, mode: 'validate' });

    expect(result.diagnostics).toEqual([]);
  });

  test('rejects the obsolete knip script when knip:check is missing', async () => {
    const fixture = await createDoctorFixture({
      packageJson: createPublicPackageJson({
        knip: 'ankhorage-knip',
      }),
    });

    const result = await analyzeDoctorTarget({ cwd: fixture, mode: 'fix' });
    const diagnostic = result.diagnostics.find(
      (entry) => entry.ruleId === 'package.scripts.knip.required',
    );

    expect(diagnostic?.message).toBe('Missing required package script: knip:check');
    expect(result.fixPlan?.diagnostics).toContainEqual(diagnostic);
  });
});

function createPublicPackageJson(knipScript: Readonly<Record<string, string>>) {
  return {
    name: '@ankhorage/devtools-synchronized-fixture',
    version: '1.0.0',
    description: 'Devtools 1.7.0 synchronized public package fixture.',
    license: 'MIT',
    type: 'module',
    repository: {
      type: 'git',
      url: 'git+https://github.com/ankhorage/devtools-synchronized-fixture.git',
    },
    homepage: 'https://github.com/ankhorage/devtools-synchronized-fixture#readme',
    bugs: {
      url: 'https://github.com/ankhorage/devtools-synchronized-fixture/issues',
    },
    keywords: ['ankhorage', 'fixture'],
    files: ['dist', 'README.md', 'CHANGELOG.md', 'LICENSE'],
    exports: {
      '.': './dist/index.js',
    },
    publishConfig: {
      access: 'public',
    },
    scripts: {
      build: 'bun x tsc -p tsconfig.build.json',
      typecheck: 'bun x tsc --noEmit -p tsconfig.json',
      lint: 'ankhorage-eslint . --max-warnings=0',
      'lint:fix': 'ankhorage-eslint . --fix --max-warnings=0',
      format: 'ankhorage-prettier --write .',
      'format:check': 'ankhorage-prettier --check .',
      test: 'bun test',
      docs: 'echo docs',
      changeset: 'changeset',
      'changeset:status': 'changeset status --since=origin/main',
      'version-packages': 'changeset version',
      ...knipScript,
    },
    devDependencies: {
      '@ankhorage/devtools': '^1.7.0',
      '@changesets/cli': '^2.31.0',
      '@types/bun': '^1.3.14',
      '@types/node': '^25.6.0',
      typescript: '^5.9.3',
    },
    packageManager: 'bun@1.3.14',
  };
}
