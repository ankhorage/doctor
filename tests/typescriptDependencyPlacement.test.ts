import { describe, expect, test } from 'bun:test';

import { analyzeDoctorTarget } from '../src/index.js';
import { createDoctorFixture } from './testSupport.js';

describe('TypeScript dependency placement policy', () => {
  test('accepts TypeScript as a runtime dependency', async () => {
    const ruleIds = await analyzeRuleIds({
      dependencies: { typescript: '~6.0.3' },
    });

    expect(ruleIds).not.toContain('package.dependencies.typescript.required');
  });

  test('accepts TypeScript as a development dependency', async () => {
    const ruleIds = await analyzeRuleIds({
      devDependencies: { typescript: '^5.9.3' },
    });

    expect(ruleIds).not.toContain('package.dependencies.typescript.required');
  });

  test('requires TypeScript when neither dependency set declares it', async () => {
    const ruleIds = await analyzeRuleIds({});

    expect(ruleIds).toContain('package.dependencies.typescript.required');
  });
});

async function analyzeRuleIds(
  dependencyFields: Readonly<Record<string, Readonly<Record<string, string>>>>,
): Promise<readonly string[]> {
  const fixture = await createDoctorFixture({
    packageJson: {
      name: '@ankhorage/typescript-placement-fixture',
      ...dependencyFields,
    },
  });
  const result = await analyzeDoctorTarget({ cwd: fixture, mode: 'package' });

  return result.diagnostics.map((diagnostic) => diagnostic.ruleId);
}
