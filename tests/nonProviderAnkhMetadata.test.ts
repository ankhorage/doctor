import { describe, expect, test } from 'bun:test';

import { findDoctorCommandByStandaloneName, runDoctorCommand } from '../src/commands.js';
import { createCapturedCommandContext, createDoctorFixture } from './testSupport.js';

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
  },
  publishConfig: {
    access: 'public',
  },
  ankh: {
    category: 'contracts',
    provider: null,
    capabilities: ['contracts.cli'],
  },
  scripts: {
    build: 'bun x tsc -p tsconfig.build.json',
    typecheck: 'bun x tsc --noEmit -p tsconfig.json',
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
  },
  devDependencies: {
    '@ankhorage/devtools': '^1.0.0',
    '@types/bun': '^1.0.0',
    '@types/node': '^25.0.0',
    typescript: '^5.9.0',
  },
  packageManager: 'bun@1.4.2',
};

describe('non-provider Ankh package metadata', () => {
  test('accepts a nullable provider when no provider source exists', async () => {
    const fixture = await createDoctorFixture({
      packageJson: NON_PROVIDER_PACKAGE_JSON,
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
    expect(captured.stdout.value).not.toContain('package.ankh.provider-path.required');
  });
});
