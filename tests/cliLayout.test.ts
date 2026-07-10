import { describe, expect, test } from 'bun:test';

import { analyzeDoctorTargetWithCliLayout } from '../src/cliLayoutAnalysis.js';
import { createDoctorFixture } from './testSupport.js';

describe('package CLI layout policy', () => {
  test('rejects root src/cli.ts files', async () => {
    const fixture = await createDoctorFixture({
      packageJson: {
        name: '@ankhorage/internal-example',
        private: true,
      },
      extraFiles: {
        'src/cli.ts': 'export {};\n',
      },
    });

    const result = await analyzeDoctorTargetWithCliLayout({
      cwd: fixture,
      mode: 'validate',
    });

    expect(result.diagnostics.map((diagnostic) => diagnostic.ruleId)).toContain(
      'package.cli.root-file.disallowed',
    );
  });

  test('requires src/cli/index.ts for CLI-capable packages', async () => {
    const fixture = await createDoctorFixture({
      packageJson: createCliPackageJson(),
    });

    const result = await analyzeDoctorTargetWithCliLayout({
      cwd: fixture,
      mode: 'validate',
    });

    expect(result.diagnostics.map((diagnostic) => diagnostic.ruleId)).toContain(
      'package.cli.index.required',
    );
  });

  test('accepts the canonical src/cli/index.ts provider layout', async () => {
    const fixture = await createDoctorFixture({
      packageJson: createCliPackageJson(),
      extraFiles: {
        'src/cli/index.ts': 'export default {};\n',
      },
    });

    const result = await analyzeDoctorTargetWithCliLayout({
      cwd: fixture,
      mode: 'validate',
    });
    const ruleIds = result.diagnostics.map((diagnostic) => diagnostic.ruleId);

    expect(ruleIds).not.toContain('package.cli.index.required');
    expect(ruleIds).not.toContain('package.cli.root-file.disallowed');
  });
});

function createCliPackageJson() {
  return {
    name: '@ankhorage/internal-example',
    private: true,
    exports: {
      './cli': './dist/cli/index.js',
    },
    ankh: {
      category: 'example',
      provider: './dist/cli/index.js',
      capabilities: [],
    },
  };
}
