import { REPOSITORY_POLICY } from '@ankhorage/policy/repository';
import { expect, test } from 'bun:test';

import { analyzeDoctorTarget } from '../src/index.js';
import { createDoctorFixture } from './testSupport.js';

const BUN_POLICY = REPOSITORY_POLICY.runtime.bun;
const BUN_POLICY_RULE_IDS = Object.values(REPOSITORY_POLICY.rules).map((rule) => rule.id);

test('reports every managed Bun drift location from canonical repository policy', async () => {
  const fixture = await createDoctorFixture({
    packageJson: createPublicPackageJson('bun@0.0.0', '^0.0.0'),
    extraFiles: createWorkflowFiles('0.0.0'),
  });

  const result = await analyzeDoctorTarget({ cwd: fixture, mode: 'validate' });
  const diagnostics = result.diagnostics.filter(isBunPolicyDiagnostic);

  expect(diagnostics.map((diagnostic) => diagnostic.ruleId).sort()).toEqual(
    [...BUN_POLICY_RULE_IDS].sort(),
  );
  for (const diagnostic of diagnostics) {
    expect(diagnostic.message).toContain(getExpectedPolicyValue(diagnostic.ruleId));
    expect(diagnostic.message).toContain('ankh devtools sync');
    expect(diagnostic.severity).toBe('error');
  }
});

test('accepts repository state synchronized to canonical repository policy', async () => {
  const fixture = await createDoctorFixture({
    packageJson: createPublicPackageJson(BUN_POLICY.packageManager, BUN_POLICY.typesRange),
    extraFiles: createWorkflowFiles(BUN_POLICY.version),
  });

  const result = await analyzeDoctorTarget({ cwd: fixture, mode: 'validate' });

  expect(result.diagnostics.filter(isBunPolicyDiagnostic)).toEqual([]);
});

test('does not require target-local Devtools policy exports', async () => {
  const fixture = await createDoctorFixture({
    packageJson: createPublicPackageJson(BUN_POLICY.packageManager, BUN_POLICY.typesRange),
    extraFiles: createWorkflowFiles(BUN_POLICY.version),
  });

  const result = await analyzeDoctorTarget({ cwd: fixture, mode: 'validate' });

  expect(result.diagnostics.filter(isBunPolicyDiagnostic)).toEqual([]);
});

test('reports missing managed workflow Bun state as repairable drift', async () => {
  const fixture = await createDoctorFixture({
    packageJson: createPublicPackageJson(BUN_POLICY.packageManager, BUN_POLICY.typesRange),
    extraFiles: {
      '.github/workflows/ci.yml': 'name: CI\n',
    },
  });

  const result = await analyzeDoctorTarget({ cwd: fixture, mode: 'validate' });
  const diagnostics = result.diagnostics.filter(isBunPolicyDiagnostic);
  const workflowRuleIds = BUN_POLICY.workflowTargets.map((workflow) => workflow.ruleId);

  expect(diagnostics.map((diagnostic) => diagnostic.ruleId).sort()).toEqual(
    [...workflowRuleIds].sort(),
  );
  expect(diagnostics.every((diagnostic) => diagnostic.message.includes('ankh devtools sync'))).toBe(
    true,
  );
});

function getExpectedPolicyValue(ruleId: string): string {
  if (ruleId === REPOSITORY_POLICY.rules.packageManager.id) return BUN_POLICY.packageManager;
  if (ruleId === REPOSITORY_POLICY.rules.bunTypes.id) return BUN_POLICY.typesRange;
  return BUN_POLICY.version;
}

function isBunPolicyDiagnostic(diagnostic: { readonly ruleId: string }): boolean {
  return BUN_POLICY_RULE_IDS.some((ruleId) => ruleId === diagnostic.ruleId);
}

function createWorkflowFiles(version: string): Readonly<Record<string, string>> {
  const workflow = (name: string) =>
    `name: ${name}\n\njobs:\n  validate:\n    steps:\n      - uses: oven-sh/setup-bun@v2\n        with:\n          bun-version: '${version}'\n`;

  return Object.fromEntries(
    BUN_POLICY.workflowTargets.map(({ path }, index) => [
      path,
      workflow(index === 0 ? 'CI' : 'Release'),
    ]),
  );
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
