import { expect, test } from 'bun:test';

import { analyzeDoctorTarget } from '../src/index.js';
import { createDoctorFixture } from './testSupport.js';

const MOCK_POLICY = {
  packageManager: 'bun@9.9.9',
  typesRange: '^9.9.9',
  version: '9.9.9',
} as const;

const BUN_POLICY_RULE_IDS = [
  'package.json.package-manager.policy',
  'package.dependencies.types-bun.policy',
  'repo.workflows.ci.bun-policy',
  'repo.workflows.release.bun-policy',
] as const;

test('reports every managed Bun drift location from the target Devtools policy', async () => {
  const fixture = await createDoctorFixture({
    packageJson: createPublicPackageJson('bun@0.0.0', '^0.0.0'),
    extraFiles: createPolicyFixtureFiles('0.0.0'),
  });

  const result = await analyzeDoctorTarget({ cwd: fixture, mode: 'validate' });
  const diagnostics = result.diagnostics.filter(isBunPolicyDiagnostic);

  expect(diagnostics.map((diagnostic) => diagnostic.ruleId).sort()).toEqual(
    [...BUN_POLICY_RULE_IDS].sort(),
  );
  for (const diagnostic of diagnostics) {
    expect(diagnostic.message).toContain('9.9.9');
    expect(diagnostic.message).toContain('ankh devtools sync');
  }
});

test('accepts repository state synchronized to the target Devtools policy', async () => {
  const fixture = await createDoctorFixture({
    packageJson: createPublicPackageJson(MOCK_POLICY.packageManager, MOCK_POLICY.typesRange),
    extraFiles: createPolicyFixtureFiles(MOCK_POLICY.version),
  });

  const result = await analyzeDoctorTarget({ cwd: fixture, mode: 'validate' });

  expect(result.diagnostics.filter(isBunPolicyDiagnostic)).toEqual([]);
});

test('reports missing managed workflow Bun state as repairable drift', async () => {
  const fixture = await createDoctorFixture({
    packageJson: createPublicPackageJson(MOCK_POLICY.packageManager, MOCK_POLICY.typesRange),
    extraFiles: {
      ...createDevtoolsPolicyFiles(),
      '.github/workflows/ci.yml': 'name: CI\n',
    },
  });

  const result = await analyzeDoctorTarget({ cwd: fixture, mode: 'validate' });
  const diagnostics = result.diagnostics.filter(isBunPolicyDiagnostic);

  expect(diagnostics.map((diagnostic) => diagnostic.ruleId).sort()).toEqual(
    BUN_POLICY_RULE_IDS.slice(2).sort(),
  );
  expect(diagnostics.every((diagnostic) => diagnostic.message.includes('ankh devtools sync'))).toBe(
    true,
  );
});

function isBunPolicyDiagnostic(diagnostic: { readonly ruleId: string }): boolean {
  return BUN_POLICY_RULE_IDS.some((ruleId) => ruleId === diagnostic.ruleId);
}

function createPolicyFixtureFiles(version: string): Readonly<Record<string, string>> {
  return {
    ...createDevtoolsPolicyFiles(),
    ...createWorkflowFiles(version),
  };
}

function createDevtoolsPolicyFiles(): Readonly<Record<string, string>> {
  return {
    'node_modules/@ankhorage/devtools/package.json': `${JSON.stringify({
      name: '@ankhorage/devtools',
      version: '1.4.1',
      type: 'module',
      exports: { './policy': './policy.js' },
    })}\n`,
    'node_modules/@ankhorage/devtools/policy.js': `export const bunRuntimePolicy = ${JSON.stringify(
      MOCK_POLICY,
    )};\n`,
  };
}

function createWorkflowFiles(version: string): Readonly<Record<string, string>> {
  const workflow = (name: string) =>
    `name: ${name}\n\njobs:\n  validate:\n    steps:\n      - uses: oven-sh/setup-bun@v2\n        with:\n          bun-version: '${version}'\n`;
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
    scripts: createRequiredScripts(),
    devDependencies: {
      typescript: '^5.9.3',
      '@changesets/cli': '^2.31.0',
      '@types/bun': bunTypes,
      '@types/node': '^25.6.0',
      '@ankhorage/devtools': '^1.4.1',
    },
  };
}

function createRequiredScripts(): Record<string, string> {
  return {
    build: 'echo build',
    typecheck: 'echo typecheck',
    lint: 'ankhorage-eslint . --max-warnings=0',
    'lint:fix': 'ankhorage-eslint . --fix --max-warnings=0',
    format: 'ankhorage-prettier --write .',
    'format:check': 'ankhorage-prettier --check .',
    test: 'bun test',
    'knip:check': 'ankhorage-knip',
    docs: 'echo docs',
    changeset: 'changeset',
    'changeset:status': 'changeset status --since=origin/main',
    'version-packages': 'changeset version',
  };
}
