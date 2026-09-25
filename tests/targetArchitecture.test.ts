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

  test('accepts the metadata-declared explicit provider source', async () => {
    const fixture = await createDoctorFixture({
      packageJson: createCliPackageJson(),
      extraFiles: {
        'src/cli/createCliProvider.ts': 'export default {} as const;\n',
      },
    });

    const ruleIds = await analyzeRuleIds(fixture);

    expect(ruleIds).not.toContain('package.cli.export.required');
    expect(ruleIds).not.toContain('provider.source.required');
    expect(ruleIds).not.toContain('provider.source.importable');
  });

  test('requires a package.json ./cli export for CLI-capable packages', async () => {
    const fixture = await createDoctorFixture({
      packageJson: createCliPackageJson({ withCliExport: false }),
      extraFiles: {
        'src/cli/createCliProvider.ts': 'export default {} as const;\n',
      },
    });

    const ruleIds = await analyzeRuleIds(fixture);

    expect(ruleIds).toContain('package.cli.export.required');
  });

  test('accepts the explicit provider and matching ./cli export layout', async () => {
    const fixture = await createDoctorFixture({
      packageJson: createCliPackageJson(),
      extraFiles: {
        'src/cli/createCliProvider.ts': 'export default {} as const;\n',
      },
    });

    const ruleIds = await analyzeRuleIds(fixture);

    expect(ruleIds).not.toContain('package.cli.export.required');
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
    expect(
      ruleIds.filter((ruleId) => ruleId === 'package.imports.ankh-workspace-alias.disallowed'),
    ).toHaveLength(2);
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
        'src/cli/createCliProvider.ts': 'export default {} as const;\n',
        'src/dnd/primitives.ts': "export * from '@ankhorage/react-native-reanimated-dnd-web';\n",
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
        'src/cli/createCliProvider.ts': 'export default {} as const;\n',
      },
    });

    const ruleIds = await analyzeRuleIds(fixture);

    expect(ruleIds).toContain('studio.dependencies.dnd.required');
    expect(ruleIds).toContain('studio.dependencies.runtime.required');
    expect(ruleIds).toContain('studio.imports.dnd.required');
    expect(ruleIds).toContain('studio.imports.runtime.required');
  });
  test('rejects local package protocols for published standalone packages', async () => {
    const fixture = await createDoctorFixture({
      packageJson: {
        name: '@ankhorage/example',
        version: '1.0.0',
        dependencies: {
          '@ankhorage/runtime': 'workspace:*',
          helper: 'file:../helper',
        },
      },
    });

    const ruleIds = await analyzeRuleIds(fixture);

    expect(
      ruleIds.filter((ruleId) => ruleId === 'package.dependencies.local-protocol.disallowed'),
    ).toHaveLength(2);
  });

  test('rejects relative source imports that escape the repository root', async () => {
    const fixture = await createDoctorFixture({
      packageJson: createInternalPackageJson(),
      extraFiles: {
        'src/domain/value.ts': "export { value } from '../../../sibling/value';\n",
      },
    });

    const ruleIds = await analyzeRuleIds(fixture);

    expect(ruleIds).toContain('package.imports.outside-root.disallowed');
  });

  test('accepts coherent feature-first roles without requiring empty layers', async () => {
    const fixture = await createDoctorFixture({
      packageJson: createInternalPackageJson(),
      extraFiles: {
        'src/features/orders/domain/order.ts': 'export const order = 1;\n',
        'src/features/orders/application/createOrder.ts':
          "import { order } from '../domain/order'; export const createOrder = () => order;\n",
        'src/features/orders/adapters/outbound/repository.ts':
          "import { createOrder } from '../../application/createOrder'; export const repository = createOrder;\n",
        'src/features/value/domain/value.ts': 'export const value = 1;\n',
      },
    });

    const ruleIds = await analyzeRuleIds(fixture);

    expect(ruleIds).not.toContain('package.architecture.role-combination.invalid');
    expect(ruleIds).not.toContain('package.architecture.domain-outward-import.disallowed');
    expect(ruleIds).not.toContain('package.architecture.application-outward-import.disallowed');
  });

  test('rejects feature adapters without an inward capability boundary', async () => {
    const fixture = await createDoctorFixture({
      packageJson: createInternalPackageJson(),
      extraFiles: {
        'src/features/orders/adapters/http.ts': 'export const http = true;\n',
      },
    });

    const ruleIds = await analyzeRuleIds(fixture);

    expect(ruleIds).toContain('package.architecture.role-combination.invalid');
  });

  test('rejects domain and application imports that point outward', async () => {
    const fixture = await createDoctorFixture({
      packageJson: createInternalPackageJson(),
      extraFiles: {
        'src/features/orders/domain/order.ts':
          "import { repository } from '../adapters/repository'; export const order = repository;\n",
        'src/features/orders/application/createOrder.ts':
          "import { wire } from '../composition/wire'; export const createOrder = wire;\n",
        'src/features/orders/adapters/repository.ts': 'export const repository = 1;\n',
        'src/features/orders/composition/wire.ts': 'export const wire = 1;\n',
      },
    });

    const ruleIds = await analyzeRuleIds(fixture);

    expect(ruleIds).toContain('package.architecture.domain-outward-import.disallowed');
    expect(ruleIds).toContain('package.architecture.application-outward-import.disallowed');
  });

  test('rejects CLI commands that wire concrete adapters directly', async () => {
    const fixture = await createDoctorFixture({
      packageJson: createInternalPackageJson(),
      extraFiles: {
        'src/cli/commands/issue.ts':
          "import { runtime } from '../../features/tls/adapters/outbound/docker/runtime'; export const issue = runtime;\n",
        'src/features/tls/adapters/outbound/docker/runtime.ts': 'export const runtime = true;\n',
        'src/features/tls/application/use-case.ts': 'export const useCase = true;\n',
      },
    });

    const ruleIds = await analyzeRuleIds(fixture);

    expect(ruleIds).toContain(
      'package.architecture.delivery-concrete-adapter-import.disallowed',
    );
  });

  test('rejects generic architectural catch-all directories', async () => {
    const fixture = await createDoctorFixture({
      packageJson: createInternalPackageJson(),
      extraFiles: {
        'src/shared/value.ts': 'export const value = 1;\n',
      },
    });

    const ruleIds = await analyzeRuleIds(fixture);

    expect(ruleIds).toContain('package.architecture.catch-all-directory.disallowed');
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
      provider: './dist/cli/createCliProvider.js',
      capabilities: [],
    },
  };

  if (options.withCliExport !== false) {
    packageJson.exports = {
      './cli': './dist/cli/createCliProvider.js',
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
