import { describe, expect, test } from 'bun:test';

import { analyzeDoctorTargetWithCliLayout } from '../src/cliLayoutAnalysis.js';
import { createDoctorFixture } from './testSupport.js';

describe('target package architecture policy', () => {
  test('rejects root src/cli.ts files', async () => {
    const fixture = await createDoctorFixture({
      packageJson: createInternalPackageJson(),
      extraFiles: {
        'src/cli.ts': 'export {};\n',
      },
    });

    const ruleIds = await analyzeRuleIds(fixture);

    expect(ruleIds).toContain('package.cli.root-file.disallowed');
  });

  test('requires src/cli/index.ts for CLI-capable packages', async () => {
    const fixture = await createDoctorFixture({
      packageJson: createCliPackageJson(),
    });

    const ruleIds = await analyzeRuleIds(fixture);

    expect(ruleIds).toContain('package.cli.index.required');
  });

  test('requires a package.json ./cli export for CLI-capable packages', async () => {
    const fixture = await createDoctorFixture({
      packageJson: createCliPackageJson({ withCliExport: false }),
      extraFiles: {
        'src/cli/index.ts': 'export default {};\n',
      },
    });

    const ruleIds = await analyzeRuleIds(fixture);

    expect(ruleIds).toContain('package.cli.export.required');
  });

  test('accepts the canonical src/cli/index.ts provider and ./cli export layout', async () => {
    const fixture = await createDoctorFixture({
      packageJson: createCliPackageJson(),
      extraFiles: {
        'src/cli/index.ts': 'export default {};\n',
      },
    });

    const ruleIds = await analyzeRuleIds(fixture);

    expect(ruleIds).not.toContain('package.cli.export.required');
    expect(ruleIds).not.toContain('package.cli.index.required');
    expect(ruleIds).not.toContain('package.cli.root-file.disallowed');
  });

  test('rejects @ankh workspace aliases in dependencies and active source imports', async () => {
    const fixture = await createDoctorFixture({
      packageJson: {
        ...createInternalPackageJson(),
        dependencies: {
          '@ankh/runtime': 'workspace:*',
        },
      },
      extraFiles: {
        'src/index.ts': [
          "import type { RuntimeAction } from '@ankh/runtime';",
          "export * from '@ankh/studio/runtime';",
          'export type { RuntimeAction };',
          '',
        ].join('\n'),
      },
    });

    const result = await analyze(fixture);
    const ruleIds = result.diagnostics.map((diagnostic) => diagnostic.ruleId);
    const messages = result.diagnostics.map((diagnostic) => diagnostic.message).join('\n');

    expect(ruleIds).toContain('package.dependencies.ankh-workspace-alias.disallowed');
    expect(ruleIds.filter((ruleId) => ruleId === 'package.imports.ankh-workspace-alias.disallowed'))
      .toHaveLength(2);
    expect(messages).toContain('@ankhorage/runtime');
    expect(messages).toContain('@ankhorage/studio/runtime');
  });

  test('rejects ankhorage4 as active dependency or import source', async () => {
    const fixture = await createDoctorFixture({
      packageJson: {
        ...createInternalPackageJson(),
        dependencies: {
          'legacy-runtime': 'file:../ankhorage4/packages/runtime',
        },
      },
      extraFiles: {
        'docs/migration.md': 'Historical context: ankhorage4.\n',
        'src/index.test.ts': "import '@ankh/runtime';\n",
        'src/index.ts': "export * from '../../ankhorage4/packages/runtime/src';\n",
      },
    });

    const ruleIds = await analyzeRuleIds(fixture);

    expect(ruleIds).toContain('package.dependencies.ankhorage4-source.disallowed');
    expect(ruleIds).toContain('package.imports.ankhorage4-source.disallowed');
    expect(ruleIds).not.toContain('package.imports.ankh-workspace-alias.disallowed');
  });

  test('accepts the current @ankhorage/studio ownership boundaries', async () => {
    const fixture = await createDoctorFixture({
      packageJson: createStudioPackageJson({ withOwnerDependencies: true }),
      extraFiles: {
        'src/cli/index.ts': 'export default {};\n',
        'src/dnd/primitives.ts':
          "export * from '@ankhorage/react-native-reanimated-dnd-web';\n",
        'src/runtime/registry.ts': "import { createRuntime } from '@ankhorage/runtime';\n",
      },
    });

    const ruleIds = await analyzeRuleIds(fixture);

    expect(ruleIds).not.toContain('studio.dependencies.dnd.required');
    expect(ruleIds).not.toContain('studio.dependencies.runtime.required');
    expect(ruleIds).not.toContain('studio.imports.dnd.required');
    expect(ruleIds).not.toContain('studio.imports.runtime.required');
  });

  test('requires Studio to depend on and import both owning packages directly', async () => {
    const fixture = await createDoctorFixture({
      packageJson: createStudioPackageJson({ withOwnerDependencies: false }),
      extraFiles: {
        'src/cli/index.ts': 'export default {};\n',
      },
    });

    const ruleIds = await analyzeRuleIds(fixture);

    expect(ruleIds).toContain('studio.dependencies.dnd.required');
    expect(ruleIds).toContain('studio.dependencies.runtime.required');
    expect(ruleIds).toContain('studio.imports.dnd.required');
    expect(ruleIds).toContain('studio.imports.runtime.required');
  });
});

async function analyze(fixture: string) {
  return analyzeDoctorTargetWithCliLayout({
    cwd: fixture,
    mode: 'validate',
  });
}

async function analyzeRuleIds(fixture: string) {
  const result = await analyze(fixture);
  return result.diagnostics.map((diagnostic) => diagnostic.ruleId);
}

function createInternalPackageJson() {
  return {
    name: '@ankhorage/internal-example',
    private: true,
  };
}

function createCliPackageJson(options: { withCliExport?: boolean } = {}) {
  const packageJson: Record<string, unknown> = {
    ...createInternalPackageJson(),
    ankh: {
      category: 'example',
      provider: './dist/cli/index.js',
      capabilities: [],
    },
  };

  if (options.withCliExport !== false) {
    packageJson.exports = {
      './cli': './dist/cli/index.js',
    };
  }

  return packageJson;
}

function createStudioPackageJson(options: { withOwnerDependencies: boolean }) {
  return {
    ...createCliPackageJson(),
    name: '@ankhorage/studio',
    dependencies: options.withOwnerDependencies
      ? {
          '@ankhorage/react-native-reanimated-dnd-web': '^0.3.2',
          '@ankhorage/runtime': '^0.2.1',
        }
      : {},
  };
}
