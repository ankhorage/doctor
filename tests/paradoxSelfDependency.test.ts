import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

import { analyzeDoctorTarget } from '../src/analysis.js';

describe('Paradox dependency policy', () => {
  test('does not require @ankhorage/paradox to depend on itself', async () => {
    const root = await createPublicPackage('@ankhorage/paradox');
    try {
      const result = await analyzeDoctorTarget({ cwd: root, mode: 'validate' });
      expect(
        result.diagnostics.some(
          (diagnostic) => diagnostic.ruleId === 'package.dependencies.paradox.required',
        ),
      ).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  test('still requires Paradox for other packages that own Paradox docs generation', async () => {
    const root = await createPublicPackage('@ankhorage/docs-fixture');
    try {
      const result = await analyzeDoctorTarget({ cwd: root, mode: 'validate' });
      expect(
        result.diagnostics.some(
          (diagnostic) => diagnostic.ruleId === 'package.dependencies.paradox.required',
        ),
      ).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

async function createPublicPackage(name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'doctor-paradox-self-'));
  await writeFile(
    join(root, 'package.json'),
    JSON.stringify(
      {
        name,
        version: '1.0.0',
        description: 'Fixture package.',
        license: 'MIT',
        type: 'module',
        publishConfig: { access: 'public' },
        repository: { type: 'git', url: 'https://example.com/repo.git' },
        homepage: 'https://example.com',
        keywords: ['fixture'],
        files: ['dist'],
        exports: { '.': './dist/index.js' },
        packageManager: 'bun@1.3.13',
        scripts: {
          build: 'tsc',
          typecheck: 'tsc --noEmit',
          lint: 'eslint .',
          'lint:fix': 'eslint . --fix',
          format: 'prettier --write .',
          'format:check': 'prettier --check .',
          test: 'bun test',
          knip: 'knip',
          docs: 'bunx @ankhorage/paradox',
          changeset: 'changeset',
          'changeset:status': 'changeset status',
          'version-packages': 'changeset version',
        },
        devDependencies: {
          '@ankhorage/devtools': '1.0.0',
          '@changesets/cli': '2.0.0',
          '@types/bun': '1.0.0',
          '@types/node': '1.0.0',
          typescript: '5.0.0',
        },
      },
      null,
      2,
    ),
  );
  await writeFile(join(root, 'paradox.config.ts'), 'export default {};\n');
  return root;
}
