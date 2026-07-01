import { describe, expect, test } from 'bun:test';

import { findDoctorCommandByStandaloneName, runDoctorCommand } from '../src/commands.js';
import {
  createCapturedCommandContext,
  createDoctorFixture,
  createStandaloneFile,
  snapshotDirectory,
} from './testSupport.js';

describe('doctor command runner', () => {
  test('validate reports missing paths', async () => {
    const fixture = await createDoctorFixture();
    const captured = createCapturedCommandContext(fixture);

    const result = await runDoctorCommand({
      argv: ['missing-path'],
      command: getCommand('validate'),
      context: captured.context,
    });

    expect(result.exitCode).toBe(1);
    expect(captured.stdout.value).toContain('target.path.exists');
  });

  test('validate rejects file paths', async () => {
    const fixture = await createDoctorFixture({
      withGitDir: true,
    });
    const filePath = await createStandaloneFile(fixture, 'notes.txt');
    const captured = createCapturedCommandContext(fixture);

    const result = await runDoctorCommand({
      argv: [filePath],
      command: getCommand('validate'),
      context: captured.context,
    });

    expect(result.exitCode).toBe(1);
    expect(captured.stdout.value).toContain('target.path.directory');
  });

  test('repo mode rejects non-repo candidates', async () => {
    const fixture = await createDoctorFixture();
    const captured = createCapturedCommandContext(fixture);

    const result = await runDoctorCommand({
      argv: [],
      command: getCommand('repo'),
      context: captured.context,
    });

    expect(result.exitCode).toBe(1);
    expect(captured.stdout.value).toContain('target.repo-markers.required');
  });

  test('package mode rejects non-package candidates', async () => {
    const fixture = await createDoctorFixture({
      withGitDir: true,
      withChangeset: true,
    });
    const captured = createCapturedCommandContext(fixture);

    const result = await runDoctorCommand({
      argv: [],
      command: getCommand('package'),
      context: captured.context,
    });

    expect(result.exitCode).toBe(1);
    expect(captured.stdout.value).toContain('target.package-json.required');
  });

  test('validate reports malformed package.json', async () => {
    const fixture = await createDoctorFixture({
      packageJson: 'invalid-json',
    });
    const captured = createCapturedCommandContext(fixture);

    const result = await runDoctorCommand({
      argv: [],
      command: getCommand('validate'),
      context: captured.context,
    });

    expect(result.exitCode).toBe(1);
    expect(captured.stdout.value).toContain('invalid-package-json');
  });

  test('valid public non-provider package passes without requiring package.json.ankh', async () => {
    const fixture = await createDoctorFixture({
      packageJson: createValidPublicPackageJson({
        docsScript: 'echo docs',
      }),
      withGitDir: true,
      withWorkflows: true,
      withChangeset: true,
      withReadme: true,
      withChangelog: true,
      withLicense: true,
    });
    const captured = createCapturedCommandContext(fixture);

    const result = await runDoctorCommand({
      argv: [],
      command: getCommand('validate'),
      context: captured.context,
    });

    expect(result.exitCode).toBe(0);
    expect(captured.stdout.value).toContain('profile: public-package');
    expect(captured.stdout.value).toContain('Diagnostics:\n  none');
  });

  test('private internal @ankhorage package does not receive strict public-package field rules', async () => {
    const fixture = await createDoctorFixture({
      packageJson: {
        name: '@ankhorage/internal-example',
        private: true,
      },
    });
    const captured = createCapturedCommandContext(fixture);

    const result = await runDoctorCommand({
      argv: [],
      command: getCommand('validate'),
      context: captured.context,
    });

    expect(result.exitCode).toBe(0);
    expect(captured.stdout.value).toContain('profile: unknown');
    expect(captured.stdout.value).not.toContain('package.json.name.required');
    expect(captured.stdout.value).not.toContain('package.json.version.required');
    expect(captured.stdout.value).not.toContain('package.json.type.required');
  });

  test('public package fails when publishConfig is missing', async () => {
    const packageJson = createValidPublicPackageJson({
      docsScript: 'echo docs',
    });
    delete packageJson.publishConfig;
    const fixture = await createDoctorFixture({
      packageJson,
      withGitDir: true,
      withWorkflows: true,
      withChangeset: true,
      withReadme: true,
      withChangelog: true,
      withLicense: true,
    });
    const captured = createCapturedCommandContext(fixture);

    const result = await runDoctorCommand({
      argv: [],
      command: getCommand('validate'),
      context: captured.context,
    });

    expect(result.exitCode).toBe(1);
    expect(captured.stdout.value).toContain('package.json.publish-config.required');
  });

  test('public package fails when publishConfig.access is missing', async () => {
    const fixture = await createDoctorFixture({
      packageJson: {
        ...createValidPublicPackageJson({
          docsScript: 'echo docs',
        }),
        publishConfig: {},
      },
      withGitDir: true,
      withWorkflows: true,
      withChangeset: true,
      withReadme: true,
      withChangelog: true,
      withLicense: true,
    });
    const captured = createCapturedCommandContext(fixture);

    const result = await runDoctorCommand({
      argv: [],
      command: getCommand('validate'),
      context: captured.context,
    });

    expect(result.exitCode).toBe(1);
    expect(captured.stdout.value).toContain('package.json.publish-config.public');
  });

  test('public package fails when publishConfig.access is not public', async () => {
    const fixture = await createDoctorFixture({
      packageJson: {
        ...createValidPublicPackageJson({
          docsScript: 'echo docs',
        }),
        publishConfig: {
          access: 'restricted',
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

    const result = await runDoctorCommand({
      argv: [],
      command: getCommand('validate'),
      context: captured.context,
    });

    expect(result.exitCode).toBe(1);
    expect(captured.stdout.value).toContain('package.json.publish-config.public');
  });

  test('public package passes when publishConfig.access is public', async () => {
    const fixture = await createDoctorFixture({
      packageJson: createValidPublicPackageJson({
        docsScript: 'echo docs',
      }),
      withGitDir: true,
      withWorkflows: true,
      withChangeset: true,
      withReadme: true,
      withChangelog: true,
      withLicense: true,
    });
    const captured = createCapturedCommandContext(fixture);

    const result = await runDoctorCommand({
      argv: [],
      command: getCommand('validate'),
      context: captured.context,
    });

    expect(result.exitCode).toBe(0);
    expect(captured.stdout.value).not.toContain('package.json.publish-config.public');
  });

  test('provider package without package.json.ankh fails', async () => {
    const fixture = await createDoctorFixture({
      packageJson: createValidPublicPackageJson({
        docsScript: 'echo docs',
      }),
      withGitDir: true,
      withWorkflows: true,
      withChangeset: true,
      withReadme: true,
      withChangelog: true,
      withLicense: true,
      extraFiles: {
        'src/ankh.provider.ts': createProviderSource({
          capabilities: ['doctor.validate'],
          commandCapabilities: ['doctor.validate'],
        }),
      },
    });
    const captured = createCapturedCommandContext(fixture);

    const result = await runDoctorCommand({
      argv: [],
      command: getCommand('validate'),
      context: captured.context,
    });

    expect(result.exitCode).toBe(1);
    expect(captured.stdout.value).toContain('package.ankh.required-for-provider');
  });

  test('non-provider package with malformed package.json.ankh fails conservatively', async () => {
    const fixture = await createDoctorFixture({
      packageJson: {
        ...createValidPublicPackageJson({
          docsScript: 'echo docs',
        }),
        ankh: {
          category: '',
          capabilities: ['doctor.validate'],
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

    const result = await runDoctorCommand({
      argv: [],
      command: getCommand('validate'),
      context: captured.context,
    });

    expect(result.exitCode).toBe(1);
    expect(captured.stdout.value).toContain('package.ankh.present.valid-shape');
  });

  test('provider capability drift is enforced mechanically from the implemented provider surface', async () => {
    const fixture = await createDoctorFixture({
      packageJson: {
        ...createValidPublicPackageJson({
          docsScript: 'echo docs',
        }),
        ankh: {
          category: 'doctor',
          provider: './dist/ankh.provider.js',
          capabilities: ['doctor.validate', 'doctor.fix'],
        },
      },
      withGitDir: true,
      withWorkflows: true,
      withChangeset: true,
      withReadme: true,
      withChangelog: true,
      withLicense: true,
      extraFiles: {
        'src/ankh.provider.ts': createProviderSource({
          capabilities: ['doctor.validate'],
          commandCapabilities: ['doctor.validate'],
        }),
      },
    });
    const captured = createCapturedCommandContext(fixture);

    const result = await runDoctorCommand({
      argv: [],
      command: getCommand('validate'),
      context: captured.context,
    });

    expect(result.exitCode).toBe(1);
    expect(captured.stdout.value).toContain('package.ankh.capabilities.match-provider');
  });

  test('paradox dependency is required only when the package owns docs generation through Paradox', async () => {
    const packageJson = createValidPublicPackageJson({
      docsScript: 'bunx @ankhorage/paradox && ankhorage-prettier --write README.md paradox',
    });
    const devDependencies = getRecordField(packageJson, 'devDependencies');
    delete devDependencies['@ankhorage/paradox'];

    const fixture = await createDoctorFixture({
      packageJson,
      withGitDir: true,
      withWorkflows: true,
      withChangeset: true,
      withReadme: true,
      withChangelog: true,
      withLicense: true,
      extraFiles: {
        'src/readme-usage.ts': 'export {};\n',
      },
    });
    const captured = createCapturedCommandContext(fixture);

    const result = await runDoctorCommand({
      argv: [],
      command: getCommand('validate'),
      context: captured.context,
    });

    expect(result.exitCode).toBe(1);
    expect(captured.stdout.value).toContain('package.dependencies.paradox.required');
  });

  test('public package requires @types/bun in devDependencies', async () => {
    const packageJson = createValidPublicPackageJson({
      docsScript: 'echo docs',
    });
    const devDependencies = getRecordField(packageJson, 'devDependencies');
    delete devDependencies['@types/bun'];
    const fixture = await createDoctorFixture({
      packageJson,
      withGitDir: true,
      withWorkflows: true,
      withChangeset: true,
      withReadme: true,
      withChangelog: true,
      withLicense: true,
    });
    const captured = createCapturedCommandContext(fixture);

    const result = await runDoctorCommand({
      argv: [],
      command: getCommand('validate'),
      context: captured.context,
    });

    expect(result.exitCode).toBe(1);
    expect(captured.stdout.value).toContain('package.dependencies.types-bun.required');
  });

  test('public package requires @types/node in devDependencies', async () => {
    const packageJson = createValidPublicPackageJson({
      docsScript: 'echo docs',
    });
    const devDependencies = getRecordField(packageJson, 'devDependencies');
    delete devDependencies['@types/node'];
    const fixture = await createDoctorFixture({
      packageJson,
      withGitDir: true,
      withWorkflows: true,
      withChangeset: true,
      withReadme: true,
      withChangelog: true,
      withLicense: true,
    });
    const captured = createCapturedCommandContext(fixture);

    const result = await runDoctorCommand({
      argv: [],
      command: getCommand('validate'),
      context: captured.context,
    });

    expect(result.exitCode).toBe(1);
    expect(captured.stdout.value).toContain('package.dependencies.types-node.required');
  });

  test('provider command descriptors without matching handlers fail mechanically', async () => {
    const fixture = await createDoctorFixture({
      packageJson: {
        ...createValidPublicPackageJson({
          docsScript: 'echo docs',
        }),
        ankh: {
          category: 'doctor',
          provider: './dist/ankh.provider.js',
          capabilities: ['doctor.validate'],
        },
      },
      withGitDir: true,
      withWorkflows: true,
      withChangeset: true,
      withReadme: true,
      withChangelog: true,
      withLicense: true,
      extraFiles: {
        'src/ankh.provider.ts': createProviderSource({
          capabilities: ['doctor.validate'],
          commandCapabilities: ['doctor.validate'],
          handlerPaths: [],
        }),
      },
    });
    const captured = createCapturedCommandContext(fixture);

    const result = await runDoctorCommand({
      argv: [],
      command: getCommand('validate'),
      context: captured.context,
    });

    expect(result.exitCode).toBe(1);
    expect(captured.stdout.value).toContain('provider.commands.match-handlers');
  });

  test('fix emits planned changes and does not mutate files', async () => {
    const fixture = await createDoctorFixture({
      packageJson: createValidPublicPackageJson({
        docsScript: 'echo docs',
      }),
      withGitDir: true,
      withWorkflows: true,
      withChangeset: true,
      withLicense: true,
    });
    const before = await snapshotDirectory(fixture);
    const captured = createCapturedCommandContext(fixture);

    const result = await runDoctorCommand({
      argv: [],
      command: getCommand('fix'),
      context: captured.context,
    });

    const after = await snapshotDirectory(fixture);

    expect(result.exitCode).toBe(1);
    expect(captured.stdout.value).toContain('Planned changes:');
    expect(captured.stdout.value).toContain('repo.readme.required');
    expect(captured.stdout.value).toContain('repo.changelog.required');
    expect(after).toEqual(before);
  });

  test('validate and fix use the same policy engine', async () => {
    const fixture = await createDoctorFixture({
      packageJson: {
        ...createValidPublicPackageJson({
          docsScript: 'echo docs',
        }),
        type: 'commonjs',
      },
      withGitDir: true,
      withWorkflows: true,
      withChangeset: true,
      withReadme: true,
      withChangelog: true,
      withLicense: true,
    });
    const validateCaptured = createCapturedCommandContext(fixture);
    const fixCaptured = createCapturedCommandContext(fixture);

    const validateResult = await runDoctorCommand({
      argv: [],
      command: getCommand('validate'),
      context: validateCaptured.context,
    });
    const fixResult = await runDoctorCommand({
      argv: [],
      command: getCommand('fix'),
      context: fixCaptured.context,
    });

    expect(validateResult.exitCode).toBe(1);
    expect(fixResult.exitCode).toBe(1);
    expect(validateCaptured.stdout.value).toContain('package.json.type.module');
    expect(fixCaptured.stdout.value).toContain('package.json.type.module');
  });

  test('integration monorepo profile is recognized and does not receive public-package fix plans', async () => {
    const fixture = await createDoctorFixture({
      packageJson: {
        name: 'ankhorage4',
        private: true,
        workspaces: ['packages/*', 'apps/*'],
      },
      withGitDir: true,
    });
    const captured = createCapturedCommandContext(fixture);

    const result = await runDoctorCommand({
      argv: [],
      command: getCommand('fix'),
      context: captured.context,
    });

    expect(result.exitCode).toBe(0);
    expect(captured.stdout.value).toContain('profile: integration-monorepo');
    expect(captured.stdout.value).toContain('Planned changes:\n  none');
    expect(captured.stdout.value).not.toContain('repo.readme.required');
  });
});

function getCommand(name: 'fix' | 'package' | 'repo' | 'validate') {
  const command = findDoctorCommandByStandaloneName(name);
  if (command === null) {
    throw new Error(`Missing command definition for ${name}`);
  }

  return command;
}

function createValidPublicPackageJson(options: {
  readonly docsScript: string;
}): Record<string, unknown> {
  return {
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
    scripts: {
      build: 'bun x tsc -p tsconfig.build.json',
      typecheck: 'bun x tsc --noEmit -p tsconfig.json',
      lint: 'ankhorage-eslint . --max-warnings=0',
      'lint:fix': 'ankhorage-eslint . --fix --max-warnings=0',
      format: 'ankhorage-prettier --write .',
      'format:check': 'ankhorage-prettier --check .',
      test: 'bun test',
      knip: 'ankhorage-knip',
      docs: options.docsScript,
      changeset: 'changeset',
      'changeset:status': 'changeset status --since=origin/main',
      'version-packages': 'changeset version',
    },
    devDependencies: {
      '@ankhorage/devtools': '^1.0.6',
      '@changesets/cli': '^2.31.0',
      '@types/bun': '^1.3.13',
      '@types/node': '^25.6.0',
      typescript: '^5.9.3',
    },
    packageManager: 'bun@1.3.13',
  };
}

function createProviderSource(options: {
  readonly capabilities: readonly string[];
  readonly commandCapabilities: readonly string[];
  readonly handlerPaths?: readonly string[];
}): string {
  const handlerPaths = options.handlerPaths ?? ['validate'];
  const commandLines = options.commandCapabilities
    .map(
      (capability) =>
        `    { capability: '${capability}', path: ['${capability.split('.').at(-1) ?? 'validate'}'], summary: 'summary' },`,
    )
    .join('\n');
  const handlerLines = handlerPaths
    .map(
      (handlerPath) => `    { path: ['${handlerPath}'], handler: async () => ({ exitCode: 0 }) },`,
    )
    .join('\n');

  return [
    'const provider = {',
    "  id: '@ankhorage/example',",
    "  category: 'doctor',",
    "  version: '1.0.0',",
    `  capabilities: ${JSON.stringify(options.capabilities)},`,
    '  commands: [',
    commandLines,
    '  ],',
    '  handlers: [',
    handlerLines,
    '  ],',
    '};',
    '',
    'export default provider;',
    '',
  ].join('\n');
}

function getRecordField(
  record: Record<string, unknown>,
  fieldName: string,
): Record<string, unknown> {
  const value = record[fieldName];
  if (!isRecord(value)) {
    throw new Error(`Expected ${fieldName} to be a record.`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
