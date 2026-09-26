import { ARCHITECTURE_POLICY } from '@ankhorage/policy/architecture';
import { describe, expect, test } from 'bun:test';

import { analyzeDoctorTargetWithCliLayout } from '../src/cliLayoutAnalysis.js';
import { createDoctorFixture } from './testSupport.js';

function firstPolicyValue<T>(values: readonly T[], label: string): T {
  const [value] = values;
  if (value === undefined) throw new Error(`Policy must define ${label}.`);
  return value;
}

function requiredPublicPackageField(name: string) {
  const field = ARCHITECTURE_POLICY.publicPackage.requiredFields.find(
    (candidate) => candidate.name === name,
  );
  if (field === undefined) throw new Error(`Policy must define the ${name} field.`);
  return field;
}

describe('canonical architecture policy consumption', () => {
  test('uses Policy-owned CLI, dependency, repo, script, and field requirements', async () => {
    const catchAllDirectory = firstPolicyValue(
      ARCHITECTURE_POLICY.source.catchAllDirectories,
      'a catch-all directory',
    );
    const localProtocol = firstPolicyValue(
      ARCHITECTURE_POLICY.dependencies.localProtocolPrefixes,
      'a local dependency protocol',
    );
    const compatibilityPackage =
      `${ARCHITECTURE_POLICY.dependencies.compatibilityPackagePrefix}runtime`;
    const missingField = requiredPublicPackageField('description');
    const requiredRepoPath = firstPolicyValue(
      ARCHITECTURE_POLICY.publicPackage.requiredRepoPaths,
      'a required repository path',
    );
    const requiredScript = firstPolicyValue(
      ARCHITECTURE_POLICY.publicPackage.requiredScripts,
      'a required package script',
    );

    const fixture = await createDoctorFixture({
      packageJson: {
        name: '@ankhorage/policy-consumption-fixture',
        version: '1.0.0',
        dependencies: {
          [compatibilityPackage]: '^1.0.0',
          helper: `${localProtocol}../helper`,
        },
      },
      extraFiles: {
        [ARCHITECTURE_POLICY.cli.legacyRootFile]: 'export {};\n',
        [`src/${catchAllDirectory}/value.ts`]: 'export const value = true;\n',
        'src/index.ts': `import '${compatibilityPackage}';\n`,
      },
    });

    const result = await analyzeDoctorTargetWithCliLayout({ cwd: fixture, mode: 'validate' });
    const ruleIds = result.diagnostics.map(({ ruleId }) => ruleId);

    expect(ruleIds).toContain(ARCHITECTURE_POLICY.cli.legacyRootRuleId);
    expect(ruleIds).toContain(ARCHITECTURE_POLICY.rules.catchAllDirectory.id);
    expect(ruleIds).toContain(ARCHITECTURE_POLICY.dependencies.rules.compatibilityDependency);
    expect(ruleIds).toContain(ARCHITECTURE_POLICY.dependencies.rules.compatibilityImport);
    expect(ruleIds).toContain(ARCHITECTURE_POLICY.dependencies.rules.localProtocolDependency);
    expect(ruleIds).toContain(requiredRepoPath.ruleId);
    expect(ruleIds).toContain(requiredScript.ruleId);
    expect(ruleIds).toContain(missingField.ruleId);
  });

  test('uses Policy-owned role, feature-combination, and thin-delivery rules', async () => {
    const domainPolicy = ARCHITECTURE_POLICY.source.roles.domain;
    const domainSegment = firstPolicyValue(domainPolicy.segments, 'a domain segment');
    const outwardSegment = firstPolicyValue(
      domainPolicy.forbiddenOutwardSegments,
      'an outward domain segment',
    );
    const compositionPolicy = ARCHITECTURE_POLICY.source.featureCombinations.composition;
    const deliveryPolicy = ARCHITECTURE_POLICY.source.thinDeliveryAdapter;
    const commandPath = ['src', ...deliveryPolicy.pathSegments, 'issue.ts'].join('/');

    const fixture = await createDoctorFixture({
      packageJson: {
        name: '@ankhorage/internal-policy-fixture',
        private: true,
      },
      extraFiles: {
        [`src/features/orders/${domainSegment}/order.ts`]:
          `import { repository } from '../${outwardSegment}/repository'; export const order = repository;\n`,
        [`src/features/orders/${outwardSegment}/repository.ts`]:
          'export const repository = true;\n',
        'src/features/orphan/composition/wire.ts': 'export const wire = true;\n',
        [commandPath]:
          `import { repository } from '../../features/orders/${deliveryPolicy.concreteAdapterSegment}/repository'; export const issue = repository;\n`,
      },
    });

    const result = await analyzeDoctorTargetWithCliLayout({ cwd: fixture, mode: 'validate' });
    const ruleIds = result.diagnostics.map(({ ruleId }) => ruleId);

    expect(ruleIds).toContain(domainPolicy.ruleId);
    expect(ruleIds).toContain(compositionPolicy.ruleId);
    expect(ruleIds).toContain(deliveryPolicy.ruleId);
  });
});
