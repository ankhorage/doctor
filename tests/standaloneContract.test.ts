import { expect, test } from 'bun:test';

import { analyzeDoctorTargetWithCliLayout } from '../src/index.js';
import { createDoctorFixture } from './testSupport.js';

test('Doctor analyzes an independently created repository without sibling state', async () => {
  const fixture = await createDoctorFixture({
    packageJson: {
      name: 'external-consumer',
      private: true,
    },
    extraFiles: {
      'src/domain/value.ts': 'export const value = 1;\n',
    },
  });

  const result = await analyzeDoctorTargetWithCliLayout({
    cwd: fixture,
    mode: 'validate',
  });

  expect(result.targetPath).toBe(fixture);
  expect(
    result.diagnostics.filter(({ ruleId }) => ruleId.startsWith('package.architecture.')),
  ).toEqual([]);
});
