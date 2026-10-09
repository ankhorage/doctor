import { expect, test } from 'bun:test';

import { analyzeDoctorTarget } from '../src/analysis.js';
import { createDoctorFixture } from './testSupport.js';

const catalogRules = [
  'package.ankh.capabilities.catalog.valid',
  'package.ankh.capabilities.match-catalog',
  'package.ankh.capabilities.unique',
  'package.ankh.required-for-capability-catalog',
] as const;

test('capability catalog metadata accepts exact source and metadata parity', async () => {
  const capability = createCapability('fixture.parity');
  const result = await analyzeCatalog({ catalog: [capability], metadata: [capability] });

  expect(catalogDiagnostics(result)).toEqual([]);
});

test('capability catalog metadata normalizes property, access, and binding-role ordering', async () => {
  const sourceCapability = {
    access: ['write', 'invoke'],
    binding: { bindableAs: ['target', 'source'], kind: 'action' },
    id: 'fixture.ordering',
    owner: '@ankhorage/fixture',
  };
  const metadataCapability = {
    id: 'fixture.ordering',
    owner: '@ankhorage/fixture',
    access: ['invoke', 'write'],
    binding: { kind: 'action', bindableAs: ['source', 'target'] },
  };
  const result = await analyzeCatalog({
    catalog: [sourceCapability],
    metadata: [metadataCapability],
  });

  expect(catalogDiagnostics(result)).toEqual([]);
});

test('capability catalog metadata reports descriptor field drift', async () => {
  const result = await analyzeCatalog({
    catalog: [createCapability('fixture.drift', { label: 'Current' })],
    metadata: [createCapability('fixture.drift', { label: 'Stale' })],
  });

  expect(catalogDiagnostics(result)).toEqual(['package.ankh.capabilities.match-catalog']);
});

test('capability catalog metadata reports missing source capability metadata', async () => {
  const result = await analyzeCatalog({
    catalog: [createCapability('fixture.one'), createCapability('fixture.two')],
    metadata: [createCapability('fixture.one')],
  });

  expect(catalogDiagnostics(result)).toEqual(['package.ankh.capabilities.match-catalog']);
});

test('capability catalog metadata reports extra published metadata', async () => {
  const result = await analyzeCatalog({
    catalog: [createCapability('fixture.one')],
    metadata: [createCapability('fixture.one'), createCapability('fixture.two')],
  });

  expect(catalogDiagnostics(result)).toEqual(['package.ankh.capabilities.match-catalog']);
});

test('capability catalog metadata reports duplicate published ids', async () => {
  const capability = createCapability('fixture.duplicate');
  const result = await analyzeCatalog({
    catalog: [capability],
    metadata: [capability, capability],
  });

  expect(catalogDiagnostics(result)).toEqual(['package.ankh.capabilities.unique']);
});

test('capability catalog metadata reports invalid public descriptors', async () => {
  const result = await analyzeCatalog({
    catalog: [{ id: 'invalid' }],
    metadata: [createCapability('fixture.valid')],
  });

  expect(catalogDiagnostics(result)).toEqual(['package.ankh.capabilities.catalog.valid']);
});

test('capability catalog metadata requires a valid public export', async () => {
  const fixture = await createDoctorFixture({
    packageJson: {
      ankh: {
        category: 'fixture',
        provider: null,
        capabilities: [createCapability('fixture.unpublished')],
      },
    },
    extraFiles: {
      'src/capabilities/index.ts': catalogSource([createCapability('fixture.unpublished')]),
    },
  });
  const result = await analyzeDoctorTarget({ cwd: fixture, mode: 'package' });

  expect(catalogDiagnostics(result)).toEqual(['package.ankh.capabilities.catalog.valid']);
});

test('unrelated public capabilities exports do not opt a package into a catalog', async () => {
  const fixture = await createDoctorFixture({
    packageJson: { exports: { './capabilities': './dist/capabilities.js' } },
    extraFiles: {
      'src/capabilities.ts': 'export const isCapability = () => true;\n',
    },
  });

  const result = await analyzeDoctorTarget({ cwd: fixture, mode: 'package' });

  expect(catalogDiagnostics(result)).toEqual([]);
});

test('capability catalog metadata accepts Devtools-style imported derived catalogs', async () => {
  const capability = createCapability('fixture.derived.one');
  const fixture = await createDoctorFixture({
    packageJson: {
      ankh: { category: 'fixture', provider: null, capabilities: [capability] },
      exports: { './capabilities': './dist/capabilities/index.js' },
    },
    extraFiles: {
      'src/metadata/events.ts': "export const EVENTS = ['one'];\n",
      'src/capabilities/index.ts': `import type { Capability } from '@ankhorage/contracts/capability';
import { EVENTS } from '../metadata/events';

export const CAPABILITIES = EVENTS.map((name) => ({
  id: \`fixture.derived.\${name}\`,
  owner: '@ankhorage/fixture',
  access: ['invoke'],
  binding: { kind: 'action', bindableAs: ['target'] },
})) satisfies readonly Capability[];
throw new Error('Doctor must not execute catalog modules');
`,
    },
  });

  const result = await analyzeDoctorTarget({ cwd: fixture, mode: 'package' });

  expect(catalogDiagnostics(result)).toEqual([]);
});

test('capability catalog metadata accepts static descriptor composition', async () => {
  const capability = createCapability('fixture.composed', { label: 'Composed' });
  const result = await analyzeCatalog({
    catalog: [capability],
    metadata: [capability],
    catalogSource: `const descriptor = ${JSON.stringify(createCapability('fixture.composed'))};
export const CAPABILITIES = [{ ...descriptor, label: 'Composed' }];\n`,
  });

  expect(catalogDiagnostics(result)).toEqual([]);
});

test('capability catalog metadata rejects duplicate canonical source ids', async () => {
  const capability = createCapability('fixture.duplicate');
  const result = await analyzeCatalog({
    catalog: [capability, capability],
    metadata: [capability],
  });

  expect(catalogDiagnostics(result)).toEqual(['package.ankh.capabilities.catalog.valid']);
});

test('capability catalog metadata reports malformed canonical source clearly', async () => {
  const fixture = await createDoctorFixture({
    packageJson: {
      ankh: { category: 'fixture', provider: null, capabilities: [] },
      exports: { './capabilities': './dist/capabilities/index.js' },
    },
    extraFiles: { 'src/capabilities/index.ts': 'export const OTHER = [];\n' },
  });

  const result = await analyzeDoctorTarget({ cwd: fixture, mode: 'package' });

  expect(catalogDiagnostics(result)).toEqual(['package.ankh.capabilities.catalog.valid']);
  expect(result.diagnostics.map((diagnostic) => diagnostic.message).join('\n')).toContain(
    'Unable to find static export CAPABILITIES',
  );
});

test('capability catalog metadata rejects unsupported dynamic expressions without executing them', async () => {
  const fixture = await createDoctorFixture({
    packageJson: {
      ankh: { category: 'fixture', provider: null, capabilities: [] },
      exports: { './capabilities': './dist/capabilities/index.js' },
    },
    extraFiles: {
      'src/capabilities/index.ts': 'export const CAPABILITIES = process.env.CAPABILITIES;\n',
    },
  });

  const result = await analyzeDoctorTarget({ cwd: fixture, mode: 'package' });

  expect(catalogDiagnostics(result)).toEqual(['package.ankh.capabilities.catalog.valid']);
  expect(result.diagnostics.map((diagnostic) => diagnostic.message).join('\n')).toContain(
    'Unsupported static capability expression',
  );
});

test('capability catalog metadata rejects external capability export targets', async () => {
  const fixture = await createDoctorFixture({
    packageJson: {
      ankh: { category: 'fixture', provider: null, capabilities: [] },
      exports: { './capabilities': '../outside.js' },
    },
    extraFiles: { 'src/capabilities/index.ts': 'export const CAPABILITIES = [];\n' },
  });

  const result = await analyzeDoctorTarget({ cwd: fixture, mode: 'package' });

  expect(catalogDiagnostics(result)).toEqual(['package.ankh.capabilities.catalog.valid']);
});

test('capability catalog metadata requires discovery metadata', async () => {
  const fixture = await createDoctorFixture({
    packageJson: { exports: { './capabilities': './dist/capabilities/index.js' } },
    extraFiles: {
      'src/capabilities/index.ts': catalogSource([createCapability('fixture.missing')]),
    },
  });
  const result = await analyzeDoctorTarget({ cwd: fixture, mode: 'package' });

  expect(catalogDiagnostics(result)).toEqual(['package.ankh.required-for-capability-catalog']);
});

test('capability catalog metadata allows provider command subsets with runtime-only capabilities', async () => {
  const invoked = createCapability('fixture.invoke');
  const runtimeOnly = createCapability('fixture.runtime');
  const result = await analyzeCatalog({
    catalog: [invoked, runtimeOnly],
    metadata: [invoked, runtimeOnly],
    providerSource: `export default {
  capabilities: ${JSON.stringify([invoked, runtimeOnly])},
  commands: [{ capability: 'fixture.invoke', path: ['invoke'] }],
  handlers: [{ path: ['invoke'], handler: () => undefined }],
};\n`,
  });

  expect(catalogDiagnostics(result)).toEqual([]);
  expect(result.diagnostics.map((diagnostic) => diagnostic.ruleId)).not.toContain(
    'provider.commands.match-capabilities',
  );
});

/*** Analyze one package fixture whose published catalog is represented by a static source module. */
async function analyzeCatalog(input: {
  readonly catalog: readonly Record<string, unknown>[];
  readonly metadata: readonly Record<string, unknown>[];
  readonly providerSource?: string;
  readonly catalogSource?: string;
}) {
  const fixture = await createDoctorFixture({
    packageJson: {
      ankh: {
        category: 'fixture',
        provider: input.providerSource === undefined ? null : './dist/cli/index.js',
        capabilities: input.metadata,
      },
      exports: { './capabilities': './dist/capabilities/index.js' },
    },
    extraFiles: {
      'src/capabilities/index.ts': input.catalogSource ?? catalogSource(input.catalog),
      ...(input.providerSource === undefined ? {} : { 'src/cli/index.ts': input.providerSource }),
    },
  });
  return analyzeDoctorTarget({ cwd: fixture, mode: 'package' });
}

/*** Select only diagnostics owned by public capability catalog validation. */
function catalogDiagnostics(result: Awaited<ReturnType<typeof analyzeDoctorTarget>>): string[] {
  return result.diagnostics
    .map((diagnostic) => diagnostic.ruleId)
    .filter((ruleId) => catalogRules.some((catalogRule) => catalogRule === ruleId));
}

/*** Create one valid canonical capability descriptor for a test catalog. */
function createCapability(id: string, additionalFields: Record<string, unknown> = {}) {
  return {
    id,
    owner: '@ankhorage/fixture',
    access: ['invoke'],
    binding: { kind: 'action', bindableAs: ['target'] },
    ...additionalFields,
  };
}

/*** Render the canonical static catalog declaration consumed by the safe source reader. */
function catalogSource(capabilities: readonly Record<string, unknown>[]): string {
  return `export const CAPABILITIES = ${JSON.stringify(capabilities, null, 2)} as const;\n`;
}
