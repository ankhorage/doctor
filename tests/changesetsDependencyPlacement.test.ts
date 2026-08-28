import { describe, expect, test } from 'bun:test';

import { analyzeDoctorTarget } from '../src/index.js';
import { createDoctorFixture } from './testSupport.js';

describe('Changesets dependency placement', () => {
  test('accepts the current consumer devDependency placement', async () => {
    const diagnostic = await getChangesetsDiagnostic(
      createPublicPackageJson('@ankhorage/example', undefined, '^2.31.0'),
    );

    expect(diagnostic).toBeUndefined();
  });

  test('accepts the Devtools published dependency placement', async () => {
    const diagnostic = await getChangesetsDiagnostic(
      createPublicPackageJson('@ankhorage/devtools', '^2.31.1'),
    );

    expect(diagnostic).toBeUndefined();
  });

  test('rejects Devtools missing or duplicating its published dependency', async () => {
    const fixtures = [
      createPublicPackageJson('@ankhorage/devtools', undefined, '^2.31.1'),
      createPublicPackageJson('@ankhorage/devtools', '^2.31.1', '^2.31.1'),
    ];

    for (const fixture of fixtures) {
      const diagnostic = await getChangesetsDiagnostic(fixture);
      expect(diagnostic?.message).toBe(
        '@ankhorage/devtools must publish @changesets/cli in dependencies, not devDependencies.',
      );
    }
  });

  test('rejects consumer dependency placement outside devDependencies', async () => {
    const diagnostic = await getChangesetsDiagnostic(
      createPublicPackageJson('@ankhorage/example', '^2.31.1'),
    );

    expect(diagnostic?.message).toBe(
      'Public package repos must declare @changesets/cli only in devDependencies.',
    );
  });
});

async function getChangesetsDiagnostic(packageJson: Record<string, unknown>) {
  const fixture = await createDoctorFixture({ packageJson });
  const result = await analyzeDoctorTarget({ cwd: fixture, mode: 'validate' });
  return result.diagnostics.find(
    (diagnostic) => diagnostic.ruleId === 'package.dependencies.changesets.required',
  );
}

function createPublicPackageJson(
  name: string,
  changesetsDependency?: string,
  changesetsDevDependency?: string,
): Record<string, unknown> {
  return {
    name,
    version: '1.0.0',
    description: 'Doctor Changesets placement fixture.',
    license: 'MIT',
    type: 'module',
    repository: { type: 'git', url: 'git+https://github.com/ankhorage/example.git' },
    homepage: 'https://github.com/ankhorage/example#readme',
    bugs: { url: 'https://github.com/ankhorage/example/issues' },
    keywords: ['ankhorage'],
    files: ['dist'],
    exports: { '.': './dist/index.js' },
    publishConfig: { access: 'public' },
    packageManager: 'bun@1.3.14',
    scripts: createRequiredScripts(),
    dependencies:
      changesetsDependency === undefined ? {} : { '@changesets/cli': changesetsDependency },
    devDependencies: {
      ...(changesetsDevDependency === undefined
        ? {}
        : { '@changesets/cli': changesetsDevDependency }),
      '@types/bun': '^1.3.14',
      '@types/node': '^25.6.0',
      typescript: '^5.9.3',
    },
  };
}

function createRequiredScripts(): Record<string, string> {
  return {
    build: 'echo build',
    typecheck: 'echo typecheck',
    lint: 'eslint .',
    'lint:fix': 'eslint . --fix',
    format: 'prettier --write .',
    'format:check': 'prettier --check .',
    test: 'bun test',
    'knip:check': 'knip',
    docs: 'echo docs',
    changeset: 'changeset',
    'changeset:status': 'changeset status --since=origin/main',
    'version-packages': 'changeset version',
  };
}
