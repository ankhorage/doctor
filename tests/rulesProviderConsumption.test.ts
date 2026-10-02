import { listArchitectureProfiles } from '@ankhorage/rules-architecture';
import { REPOSITORY_RULE_IDS, REPOSITORY_RULE_METADATA } from '@ankhorage/rules-repository';
import { describe, expect, test } from 'bun:test';

import { analyzeDoctorTargetWithCliLayout } from '../src/cliLayoutAnalysis.js';
import { createDoctorFixture } from './testSupport.js';

const ANKHORAGE_PROFILE = getAnkhorageProfile();

/*** Resolve the required Ankhorage profile without leaking optionality into fixture builders. */
function getAnkhorageProfile() {
  const [profile] = listArchitectureProfiles();
  if (profile === undefined) {
    throw new Error('Rules Architecture must expose the Ankhorage profile.');
  }
  return profile;
}

/*** Return the first provider-owned metadata value or fail the fixture setup. */
function firstRuleValue<T>(values: readonly T[], label: string): T {
  const [value] = values;
  if (value === undefined) throw new Error('Rules provider must define ' + label + '.');
  return value;
}

/*** Resolve one required public-package field from repository Rules metadata. */
function requiredPublicPackageField(name: string) {
  const field = REPOSITORY_RULE_METADATA.publicPackage.requiredFields.find(
    (candidate) => candidate.name === name,
  );
  if (field === undefined) throw new Error('Rules provider must define the ' + name + ' field.');
  return field;
}

/*** Build a fixture driven exclusively by repository Rules metadata. */
async function createPublicPackageRulesFixture() {
  const catchAllDirectory = firstRuleValue(
    REPOSITORY_RULE_METADATA.source.catchAllDirectories,
    'a catch-all directory',
  );
  const localProtocol = firstRuleValue(
    REPOSITORY_RULE_METADATA.dependencies.localProtocolPrefixes,
    'a local dependency protocol',
  );
  const compatibilityPackage =
    REPOSITORY_RULE_METADATA.dependencies.compatibilityPackagePrefix + 'runtime';
  const missingField = requiredPublicPackageField('description');
  const requiredRepoPath = firstRuleValue(
    REPOSITORY_RULE_METADATA.publicPackage.requiredRepoPaths,
    'a required repository path',
  );
  const requiredScript = firstRuleValue(
    REPOSITORY_RULE_METADATA.publicPackage.requiredScripts,
    'a required package script',
  );
  const fixture = await createDoctorFixture({
    packageJson: {
      name: '@ankhorage/rules-consumption-fixture',
      version: '1.0.0',
      dependencies: {
        [compatibilityPackage]: '^1.0.0',
        helper: localProtocol + '../helper',
      },
    },
    extraFiles: {
      [REPOSITORY_RULE_METADATA.cli.legacyRootFile]: 'export {};\n',
      ['src/' + catchAllDirectory + '/value.ts']: 'export const value = true;\n',
      'src/index.ts': "import '" + compatibilityPackage + "';\n",
    },
  });

  return {
    expectedRuleIds: [
      REPOSITORY_RULE_IDS.cliRootFile,
      REPOSITORY_RULE_IDS.catchAllDirectory,
      REPOSITORY_RULE_IDS.compatibilityDependency,
      REPOSITORY_RULE_IDS.compatibilityImport,
      REPOSITORY_RULE_IDS.localProtocolDependency,
      requiredRepoPath.ruleId,
      requiredScript.ruleId,
      missingField.ruleId,
    ],
    fixture,
  };
}

/*** Build a fixture driven by the Ankhorage architecture profile metadata. */
async function createSourceArchitectureRulesFixture() {
  const domainRole = ANKHORAGE_PROFILE.source.roles.find(({ id }) => id === 'domain');
  if (domainRole === undefined) throw new Error('Ankhorage profile must define the domain role.');
  const domainSegment = firstRuleValue(domainRole.segments, 'a domain segment');
  const outwardSegment = firstRuleValue(
    domainRole.forbiddenOutwardSegments,
    'an outward domain segment',
  );
  const delivery = ANKHORAGE_PROFILE.source.thinDeliveryAdapter;
  const commandPath = ['src', ...delivery.pathSegments, 'issue.ts'].join('/');
  const fixture = await createDoctorFixture({
    packageJson: {
      name: '@ankhorage/internal-rules-fixture',
      private: true,
    },
    extraFiles: {
      ['src/features/orders/' + domainSegment + '/order.ts']:
        "import { repository } from '../" +
        outwardSegment +
        "/repository'; export const order = repository;\n",
      ['src/features/orders/' + outwardSegment + '/repository.ts']:
        'export const repository = true;\n',
      'src/features/orphan/composition/wire.ts': 'export const wire = true;\n',
      [commandPath]:
        "import { repository } from '../../features/orders/" +
        delivery.concreteAdapterSegment +
        "/repository'; export const issue = repository;\n",
    },
  });

  expect(domainRole.ruleId).toBe('package.architecture.domain-outward-import.disallowed');
  expect(delivery.ruleId).toBe('package.architecture.delivery-concrete-adapter-import.disallowed');

  return {
    deferredRuleId: 'package.architecture.role-combination.invalid' as const,
    expectedRuleIds: [
      'package.architecture.domain-outward-import.disallowed',
      'package.architecture.delivery-concrete-adapter-import.disallowed',
    ] as const,
    fixture,
  };
}

describe('canonical Rules provider consumption', () => {
  test('uses repository Rules for CLI, dependency, repo, script, and field requirements', async () => {
    const { expectedRuleIds, fixture } = await createPublicPackageRulesFixture();
    const result = await analyzeDoctorTargetWithCliLayout({ cwd: fixture, mode: 'validate' });
    const ruleIds = result.diagnostics.map(({ ruleId }) => ruleId);

    for (const ruleId of expectedRuleIds) expect(ruleIds).toContain(ruleId);
  });

  test('uses architecture Rules while deferred profile rules remain disabled', async () => {
    const { deferredRuleId, expectedRuleIds, fixture } =
      await createSourceArchitectureRulesFixture();
    const result = await analyzeDoctorTargetWithCliLayout({ cwd: fixture, mode: 'validate' });
    const ruleIds = result.diagnostics.map(({ ruleId }) => ruleId);

    for (const ruleId of expectedRuleIds) expect(ruleIds).toContain(ruleId);
    expect(ruleIds).not.toContain(deferredRuleId);
  });
});
