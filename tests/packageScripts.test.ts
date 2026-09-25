import { REPOSITORY_POLICY } from '@ankhorage/policy/repository';
import { describe, expect, test } from 'bun:test';

import { analyzeDoctorTarget } from '../src/index.js';
import { createDoctorFixture } from './testSupport.js';

describe('public package script policy', () => {
  test('accepts the centrally synchronized knip:check contract', async () => {
    const fixture = await createDoctorFixture({
      packageJson: createPublicPackageJson({
        'knip:check': 'ankhorage-knip',
      }),
      withChangelog: true,
      withChangeset: true,
      withLicense: true,
      withReadme: true,
      extraFiles: createCanonicalWorkflowFiles(),
    });

    const result = await analyzeDoctorTarget({ cwd: fixture, mode: 'validate' });

    expect(result.diagnostics).toEqual([]);
  });

  test('requires an explicit standalone contract test', async () => {
    const packageJson = createPublicPackageJson({
      'knip:check': 'ankhorage-knip',
    });
    const scripts = packageJson.scripts as Record<string, string>;
    delete scripts['test:standalone'];
    const fixture = await createDoctorFixture({ packageJson });

    const result = await analyzeDoctorTarget({ cwd: fixture, mode: 'validate' });

    expect(result.diagnostics.map(({ ruleId }) => ruleId)).toContain(
      'package.scripts.standalone.required',
    );
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

function createCanonicalWorkflowFiles(): Readonly<Record<string, string>> {
  const workflow = (name: string) =>
    `name: ${name}\n\njobs:\n  validate:\n    steps:\n      - uses: oven-sh/setup-bun@v2\n        with:\n          bun-version: '${REPOSITORY_POLICY.runtime.bun.version}'\n`;

  return Object.fromEntries(
    REPOSITORY_POLICY.runtime.bun.workflowTargets.map(({ path }, index) => [
      path,
      workflow(index === 0 ? 'CI' : 'Release'),
    ]),
  );
}

function createPublicPackageJson(knipScript: Readonly<Record<string, string>>) {
  return {
    name: '@ankhorage/devtools-synchronized-fixture',
    version: '1.0.0',
    description: 'Devtools 1.8.0 synchronized public package fixture.',
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
      'test:standalone': 'bun test tests/standaloneContract.test.ts',
      docs: 'echo docs',
      changeset: 'changeset',
      'changeset:status': 'changeset status --since=origin/main',
      'version-packages': 'changeset version',
      ...knipScript,
    },
    devDependencies: {
      '@ankhorage/devtools': '^1.8.0',
      '@types/bun': REPOSITORY_POLICY.runtime.bun.typesRange,
      '@types/node': '^25.6.0',
      typescript: '^5.9.3',
    },
    packageManager: REPOSITORY_POLICY.runtime.bun.packageManager,
  };
}
