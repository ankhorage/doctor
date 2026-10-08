import { expect, test } from 'bun:test';

import { analyzeDoctorTarget } from '../src/analysis.js';
import { findDoctorCommandByStandaloneName, runDoctorCommand } from '../src/commands.js';
import { createCapturedCommandContext, createDoctorFixture } from './testSupport.js';

const NON_PROVIDER_CAPABILITIES = [
  {
    id: 'contracts.cli',
    owner: '@ankhorage/example',
    access: ['invoke'],
    binding: {
      kind: 'action',
      bindableAs: ['target'],
    },
  },
];

const NON_PROVIDER_PACKAGE_JSON: Record<string, unknown> = {
  name: '@ankhorage/example',
  version: '1.0.0',
  description: 'Example package.',
  repository: {
    type: 'git',
    url: 'git+https://github.com/ankhorage/example.git',
  },
  homepage: 'https://github.com/ankhorage/example#readme',
  bugs: {
    url: 'https://github.com/ankhorage/example/issues',
  },
  license: 'MIT',
  keywords: ['ankhorage', 'example'],
  type: 'module',
  files: ['dist', 'README.md', 'CHANGELOG.md', 'LICENSE'],
  exports: {
    '.': {
      import: './dist/index.js',
      types: './dist/index.d.ts',
    },
    './capabilities': './dist/capabilities/index.js',
  },
  publishConfig: {
    access: 'public',
  },
  ankh: {
    category: 'contracts',
    provider: null,
    capabilities: NON_PROVIDER_CAPABILITIES,
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
    'knip:check': 'ankhorage-knip',
    docs: 'echo docs',
    changeset: 'changeset',
    'changeset:status': 'changeset status --since=origin/main',
    'version-packages': 'changeset version',
  },
  devDependencies: {
    '@ankhorage/devtools': '^1.0.0',
    '@types/bun': '^1.0.0',
    '@types/node': '^25.0.0',
    typescript: '^5.9.0',
  },
  packageManager: 'bun@1.4.2',
};

test('non-provider metadata accepts a nullable provider when no provider source exists', async () => {
  const fixture = await createDoctorFixture({
    packageJson: NON_PROVIDER_PACKAGE_JSON,
    withGitDir: true,
    withWorkflows: true,
    withChangeset: true,
    withReadme: true,
    withChangelog: true,
    withLicense: true,
    extraFiles: {
      'src/capabilities/index.ts': `export const CAPABILITIES = ${JSON.stringify(NON_PROVIDER_CAPABILITIES)};\n`,
    },
  });
  const captured = createCapturedCommandContext(fixture);
  const command = findDoctorCommandByStandaloneName('validate');
  if (command === null) throw new Error('Missing validate command.');

  const result = await runDoctorCommand({
    argv: [],
    command,
    context: captured.context,
  });

  expect(result.exitCode).toBe(0);
  expect(captured.stdout.value).not.toContain('package.ankh.present.valid-shape');
  expect(captured.stdout.value).not.toContain('package.ankh.provider-path.required');
});

test('non-provider metadata accepts unrelated structure metadata without capabilities when no catalog exists', async () => {
  const fixture = await createDoctorFixture({
    packageJson: {
      ...NON_PROVIDER_PACKAGE_JSON,
      ankh: {
        category: 'contracts',
        provider: null,
        structure: { profile: 'contracts' },
      },
    },
    withGitDir: true,
    withWorkflows: true,
    withChangeset: true,
    withReadme: true,
    withChangelog: true,
    withLicense: true,
  });
  const captured = createCapturedCommandContext(fixture);
  const command = findDoctorCommandByStandaloneName('validate');
  if (command === null) throw new Error('Missing validate command.');

  const result = await runDoctorCommand({
    argv: [],
    command,
    context: captured.context,
  });

  expect(result.exitCode).toBe(0);
  expect(captured.stdout.value).not.toContain('package.ankh.present.valid-shape');
});

test('non-provider metadata rejects malformed capabilities when present without a catalog', async () => {
  const fixture = await createDoctorFixture({
    packageJson: {
      ...NON_PROVIDER_PACKAGE_JSON,
      ankh: {
        category: 'contracts',
        provider: null,
        structure: { profile: 'contracts' },
        capabilities: ['contracts.cli'],
      },
    },
  });
  const result = await analyzeDoctorTarget({ cwd: fixture, mode: 'package' });

  expect(result.diagnostics.map((diagnostic) => diagnostic.ruleId)).toContain(
    'package.ankh.present.valid-shape',
  );
});
