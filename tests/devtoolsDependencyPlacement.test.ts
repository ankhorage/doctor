import { describe, expect, test } from 'bun:test';

import { analyzeDoctorTarget } from '../src/analysis.js';
import { createDoctorFixture } from './testSupport.js';

describe('devtools dependency placement policy', () => {
  test('accepts the runtime devtools dependency used by @ankhorage/ankh', async () => {
    const fixture = await createDoctorFixture({
      packageJson: createPublicPackageJson({
        name: '@ankhorage/ankh',
        dependencies: { '@ankhorage/devtools': '^1.3.1' },
      }),
    });

    const ruleIds = await analyzeRuleIds(fixture);

    expect(ruleIds).not.toContain('package.dependencies.devtools.required');
  });

  test('rejects devtools in devDependencies for @ankhorage/ankh', async () => {
    const fixture = await createDoctorFixture({
      packageJson: createPublicPackageJson({
        name: '@ankhorage/ankh',
        devtoolsInDevDependencies: true,
      }),
    });

    const ruleIds = await analyzeRuleIds(fixture);

    expect(ruleIds).toContain('package.dependencies.devtools.required');
  });

  test('accepts devtools in devDependencies for ordinary public packages', async () => {
    const fixture = await createDoctorFixture({
      packageJson: createPublicPackageJson({
        name: '@ankhorage/example',
        devtoolsInDevDependencies: true,
      }),
    });

    const ruleIds = await analyzeRuleIds(fixture);

    expect(ruleIds).not.toContain('package.dependencies.devtools.required');
  });
});

async function analyzeRuleIds(fixture: string): Promise<readonly string[]> {
  const result = await analyzeDoctorTarget({ cwd: fixture, mode: 'validate' });
  return result.diagnostics.map((diagnostic) => diagnostic.ruleId);
}

function createPublicPackageJson(options: {
  readonly name: string;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devtoolsInDevDependencies?: boolean;
}): Record<string, unknown> {
  return {
    name: options.name,
    version: '1.0.0',
    description: 'Doctor fixture',
    license: 'MIT',
    type: 'module',
    repository: { type: 'git', url: 'git+https://github.com/ankhorage/example.git' },
    homepage: 'https://github.com/ankhorage/example#readme',
    keywords: ['ankhorage'],
    files: ['dist'],
    exports: { '.': './dist/index.js' },
    publishConfig: { access: 'public' },
    packageManager: 'bun@1.3.13',
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
    ...(options.dependencies === undefined ? {} : { dependencies: options.dependencies }),
    devDependencies: {
      typescript: '^5.9.3',
      '@changesets/cli': '^2.31.0',
      '@types/bun': '^1.3.13',
      '@types/node': '^25.6.0',
      ...(options.devtoolsInDevDependencies ? { '@ankhorage/devtools': '^1.3.1' } : {}),
    },
  };
}
