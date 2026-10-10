import type { Capability } from '@ankhorage/contracts/capability';
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
        'src/capabilities/index.ts': createCapabilitiesCatalogSource(['doctor.validate']),
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
          capabilities: createTestCapabilities(['doctor.validate']),
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

  test('legacy string capability metadata is rejected', async () => {
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
        'src/capabilities/index.ts': createCapabilitiesCatalogSource([
          'doctor.validate',
          'doctor.fix',
        ]),
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
          capabilities: createTestCapabilities(['doctor.validate', 'doctor.fix']),
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

  test('provider command capabilities may exactly match the published provider catalog', async () => {
    const fixture = await createDoctorFixture({
      packageJson: createProviderPackageJson(['doctor.validate']),
      withGitDir: true,
      withWorkflows: true,
      withChangeset: true,
      withReadme: true,
      withChangelog: true,
      withLicense: true,
      extraFiles: {
        'src/capabilities/index.ts': createCapabilitiesCatalogSource(['doctor.validate']),
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

    expect(result.exitCode).toBe(0);
  });

  test('provider capabilities may be an executable subset of a mixed canonical package catalog', async () => {
    const invoked = createTestCapabilities(['doctor.validate'])[0];
    const emitted = {
      id: 'doctor.event',
      owner: '@ankhorage/example',
      access: ['emit'],
      binding: { kind: 'event', bindableAs: ['source'] },
    } satisfies Capability;
    const fixture = await createDoctorFixture({
      packageJson: {
        ...createProviderPackageJson([]),
        ankh: {
          category: 'doctor',
          provider: './dist/ankh.provider.js',
          capabilities: [invoked, emitted],
        },
      },
      withGitDir: true,
      withWorkflows: true,
      withChangeset: true,
      withReadme: true,
      withChangelog: true,
      withLicense: true,
      extraFiles: {
        'src/capabilities/index.ts': `export const CAPABILITIES = ${JSON.stringify([invoked, emitted])};\n`,
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

    expect(result.exitCode).toBe(0);
  });

  test('provider capabilities must exist identically in the canonical package catalog', async () => {
    const fixture = await createDoctorFixture({
      packageJson: createProviderPackageJson(['doctor.validate']),
      withGitDir: true,
      withWorkflows: true,
      withChangeset: true,
      withReadme: true,
      withChangelog: true,
      withLicense: true,
      extraFiles: {
        'src/capabilities/index.ts': createCapabilitiesCatalogSource(['doctor.fix']),
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

  test('provider catalogs may publish runtime-only capabilities outside the command surface', async () => {
    const fixture = await createDoctorFixture({
      packageJson: createProviderPackageJson(['doctor.validate', 'doctor.fix']),
      withGitDir: true,
      withWorkflows: true,
      withChangeset: true,
      withReadme: true,
      withChangelog: true,
      withLicense: true,
      extraFiles: {
        'src/capabilities/index.ts': createCapabilitiesCatalogSource([
          'doctor.validate',
          'doctor.fix',
        ]),
        'src/ankh.provider.ts': createProviderSource({
          capabilities: ['doctor.validate', 'doctor.fix'],
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

    expect(result.exitCode).toBe(0);
  });

  test('provider commands cannot reference unpublished capabilities', async () => {
    const fixture = await createDoctorFixture({
      packageJson: createProviderPackageJson(['doctor.validate']),
      withGitDir: true,
      withWorkflows: true,
      withChangeset: true,
      withReadme: true,
      withChangelog: true,
      withLicense: true,
      extraFiles: {
        'src/ankh.provider.ts': createProviderSource({
          capabilities: ['doctor.validate'],
          commandCapabilities: ['doctor.fix'],
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
    expect(captured.stdout.value).toContain('provider.commands.match-capabilities');
  });

  test('duplicate and invalid provider capability descriptors remain rejected', async () => {
    const duplicateFixture = await createDoctorFixture({
      packageJson: createProviderPackageJson(['doctor.validate']),
      withGitDir: true,
      withWorkflows: true,
      withChangeset: true,
      withReadme: true,
      withChangelog: true,
      withLicense: true,
      extraFiles: {
        'src/ankh.provider.ts': createProviderSource({
          capabilities: ['doctor.validate', 'doctor.validate'],
          commandCapabilities: ['doctor.validate'],
        }),
      },
    });
    const invalidFixture = await createDoctorFixture({
      packageJson: createProviderPackageJson(['doctor.validate']),
      withGitDir: true,
      withWorkflows: true,
      withChangeset: true,
      withReadme: true,
      withChangelog: true,
      withLicense: true,
      extraFiles: {
        'src/ankh.provider.ts': [
          'const provider = {',
          "  id: '@ankhorage/example',",
          "  category: 'doctor',",
          "  version: '1.0.0',",
          "  capabilities: [{ id: 'doctor.validate' }],",
          "  commands: [{ capability: 'doctor.validate', path: ['validate'], summary: 'summary' }],",
          "  handlers: [{ path: ['validate'], handler: async () => ({ exitCode: 0 }) }],",
          '};',
          '',
          'export default provider;',
          '',
        ].join('\n'),
      },
    });

    const duplicateCaptured = createCapturedCommandContext(duplicateFixture);
    const invalidCaptured = createCapturedCommandContext(invalidFixture);
    const duplicateResult = await runDoctorCommand({
      argv: [],
      command: getCommand('validate'),
      context: duplicateCaptured.context,
    });
    const invalidResult = await runDoctorCommand({
      argv: [],
      command: getCommand('validate'),
      context: invalidCaptured.context,
    });

    expect(duplicateResult.exitCode).toBe(1);
    expect(invalidResult.exitCode).toBe(1);
    expect(duplicateCaptured.stdout.value).toContain('package.ankh.capabilities.match-provider');
    expect(invalidCaptured.stdout.value).toContain('package.ankh.capabilities.match-provider');
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
          capabilities: createTestCapabilities(['doctor.validate']),
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
      'test:standalone': 'bun test tests/standaloneContract.test.ts',
      'knip:check': 'ankhorage-knip',
      docs: options.docsScript,
      changeset: 'changeset',
      'changeset:status': 'changeset status --since=origin/main',
      'version-packages': 'changeset version',
    },
    devDependencies: {
      '@ankhorage/devtools': '^1.0.6',
      '@types/bun': '^1.3.13',
      '@types/node': '^25.6.0',
      typescript: '^5.9.3',
    },
    packageManager: 'bun@1.3.13',
  };
}

function createProviderPackageJson(
  capabilities: readonly Capability['id'][],
): Record<string, unknown> {
  const packageJson = createValidPublicPackageJson({
    docsScript: 'echo docs',
  });
  const exportsField = getRecordField(packageJson, 'exports');
  exportsField['./cli'] = {
    import: './dist/ankh.provider.js',
    types: './dist/ankh.provider.d.ts',
  };
  exportsField['./capabilities'] = {
    import: './dist/capabilities/index.js',
    types: './dist/capabilities/index.d.ts',
  };

  return {
    ...packageJson,
    ankh: {
      category: 'doctor',
      provider: './dist/ankh.provider.js',
      capabilities: createTestCapabilities(capabilities),
    },
  };
}

function createProviderSource(options: {
  readonly capabilities: readonly Capability['id'][];
  readonly commandCapabilities: readonly Capability['id'][];
  readonly handlerPaths?: readonly string[];
}): string {
  const handlerPaths = options.handlerPaths ?? ['validate'];
  const capabilities = createTestCapabilities(options.capabilities);
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
    `  capabilities: ${JSON.stringify(capabilities)},`,
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

/*** Render a static public capability catalog for one provider fixture. */
function createCapabilitiesCatalogSource(capabilities: readonly Capability['id'][]): string {
  return `export const CAPABILITIES = ${JSON.stringify(createTestCapabilities(capabilities))};\n`;
}

function createTestCapabilities(ids: readonly Capability['id'][]): readonly Capability[] {
  return ids.map((id) => ({
    id,
    owner: '@ankhorage/example',
    access: ['invoke'],
    binding: {
      kind: 'action',
      bindableAs: ['target'],
    },
  }));
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
