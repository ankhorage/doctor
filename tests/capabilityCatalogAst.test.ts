import { expect, test } from 'bun:test';

import { analyzeDoctorTarget } from '../src/analysis.js';
import { createDoctorFixture } from './testSupport.js';

const catalogRule = 'package.ankh.capabilities.catalog.valid';

test('capability catalogs ignore unreachable dynamic imported declarations', async () => {
  const capability = createCapability('fixture.lazy.one');
  const fixture = await createDoctorFixture({
    packageJson: {
      ankh: { category: 'fixture', provider: null, capabilities: [capability] },
      exports: { './capabilities': './dist/capabilities/index.js' },
    },
    extraFiles: {
      'src/metadata/events.ts': `export const EVENTS = ['one'];

const unrelated = process.env.RUNTIME_VALUE;
`,
      'src/capabilities/index.ts': `import { EVENTS as STATIC_EVENTS } from '../metadata/events';

export const CAPABILITIES = STATIC_EVENTS.map((event) => ({
  id: \`fixture.lazy.\${event}\`,
  owner: '@ankhorage/fixture',
  access: ['invoke'],
  binding: { kind: 'action', bindableAs: ['target'] },
}));
`,
    },
  });

  const result = await analyzeDoctorTarget({ cwd: fixture, mode: 'package' });

  expect(catalogDiagnostics(result)).toEqual([]);
});

test('capability catalogs resolve trailing package-local derived spreads without execution', async () => {
  const base = createCapability('fixture.spread.base');
  const derived = createCapability('fixture.spread.derived');
  const fixture = await createDoctorFixture({
    packageJson: {
      ankh: { category: 'fixture', provider: null, capabilities: [base, derived] },
      exports: { './capabilities': './dist/capabilities/index.js' },
    },
    extraFiles: {
      'src/metadata/createEventCapabilities.ts': `export function createEventCapabilities() {
  throw new Error('Doctor must not execute package-local catalog derivation');
}
`,
      'src/capabilities/index.ts': `import { createEventCapabilities } from '../metadata/createEventCapabilities';

export const CAPABILITIES = [${JSON.stringify(base)}, ...createEventCapabilities()];
`,
    },
  });

  const result = await analyzeDoctorTarget({ cwd: fixture, mode: 'package' });

  expect(catalogDiagnostics(result)).toEqual([]);
});

test('capability catalogs reject reachable dynamic imported declarations', async () => {
  const fixture = await createDoctorFixture({
    packageJson: {
      ankh: { category: 'fixture', provider: null, capabilities: [] },
      exports: { './capabilities': './dist/capabilities/index.js' },
    },
    extraFiles: {
      'src/metadata/dynamic.ts': 'export const DYNAMIC = process.env.RUNTIME_VALUE;\n',
      'src/capabilities/index.ts': `import { DYNAMIC } from '../metadata/dynamic';

export const CAPABILITIES = DYNAMIC;
`,
    },
  });

  const result = await analyzeDoctorTarget({ cwd: fixture, mode: 'package' });

  expect(catalogDiagnostics(result)).toEqual([catalogRule]);
  expect(result.diagnostics.map((diagnostic) => diagnostic.message).join('\n')).toContain(
    'Unsupported static capability expression',
  );
});

test('capability catalogs reject cyclic local static imports', async () => {
  const fixture = await createDoctorFixture({
    packageJson: {
      ankh: { category: 'fixture', provider: null, capabilities: [] },
      exports: { './capabilities': './dist/capabilities/index.js' },
    },
    extraFiles: {
      'src/capabilities/a.ts': "import { B } from './b';\nexport const A = B;\n",
      'src/capabilities/b.ts': "import { A } from './a';\nexport const B = A;\n",
      'src/capabilities/index.ts': "import { A } from './a';\nexport const CAPABILITIES = A;\n",
    },
  });

  const result = await analyzeDoctorTarget({ cwd: fixture, mode: 'package' });

  expect(catalogDiagnostics(result)).toEqual([catalogRule]);
  expect(result.diagnostics.map((diagnostic) => diagnostic.message).join('\n')).toContain(
    'Cyclic static capability reference',
  );
});

test('capability catalogs accept named static Contracts schema imports', async () => {
  const capability = createCapability('fixture.contracts.schema');
  const fixture = await createDoctorFixture({
    packageJson: {
      dependencies: { '@ankhorage/contracts': '^25.0.0' },
      ankh: { category: 'fixture', provider: null, capabilities: [capability] },
      exports: { './capabilities': './dist/capabilities/index.js' },
    },
    extraFiles: {
      'node_modules/@ankhorage/contracts/package.json': JSON.stringify({
        name: '@ankhorage/contracts',
        exports: { './auth': './dist/auth.js' },
      }),
      'node_modules/@ankhorage/contracts/dist/auth.js': `export const AUTH_CAPABILITY = ${JSON.stringify(capability)};
`,
      'src/capabilities/index.ts': `import { AUTH_CAPABILITY } from '@ankhorage/contracts/auth';

export const CAPABILITIES = [AUTH_CAPABILITY];
`,
    },
  });

  const result = await analyzeDoctorTarget({ cwd: fixture, mode: 'package' });

  expect(catalogDiagnostics(result)).toEqual([]);
});

test('capability catalogs resolve static property access inside Contracts schema exports', async () => {
  const inputSchema = {
    type: 'object',
    required: ['bucket', 'path', 'body'],
    properties: {
      storageId: { type: 'string' },
      bucket: { type: 'string' },
      path: { type: 'string' },
      body: { type: 'string', format: 'base64' },
    },
  };
  const capability = {
    ...createCapability('fixture.storage.upload'),
    input: { schema: inputSchema },
  };
  const fixture = await createDoctorFixture({
    packageJson: {
      dependencies: { '@ankhorage/contracts': '^25.2.0' },
      ankh: { category: 'fixture', provider: null, capabilities: [capability] },
      exports: { './capabilities': './dist/capabilities/index.js' },
    },
    extraFiles: {
      'node_modules/@ankhorage/contracts/package.json': JSON.stringify({
        name: '@ankhorage/contracts',
        exports: { './storage': './dist/storage.js' },
      }),
      'node_modules/@ankhorage/contracts/dist/storage.js': `export const STORAGE_IDENTITY_SCHEMA = {
  type: 'object',
  required: ['bucket', 'path'],
  properties: {
    storageId: { type: 'string' },
    bucket: { type: 'string' },
    path: { type: 'string' },
  },
};

export const STORAGE_UPLOAD_INPUT_SCHEMA = {
  ...STORAGE_IDENTITY_SCHEMA,
  required: ['bucket', 'path', 'body'],
  properties: {
    ...STORAGE_IDENTITY_SCHEMA.properties,
    body: { type: 'string', format: 'base64' },
  },
};
`,
      'src/capabilities/index.ts': `import { STORAGE_UPLOAD_INPUT_SCHEMA } from '@ankhorage/contracts/storage';

export const CAPABILITIES = [{
  id: 'fixture.storage.upload',
  owner: '@ankhorage/fixture',
  access: ['invoke'],
  binding: { kind: 'action', bindableAs: ['target'] },
  input: { schema: STORAGE_UPLOAD_INPUT_SCHEMA },
}];
`,
    },
  });

  const result = await analyzeDoctorTarget({ cwd: fixture, mode: 'package' });

  expect(catalogDiagnostics(result)).toEqual([]);
});

test('capability catalogs reject unrelated external package imports', async () => {
  const fixture = await createDoctorFixture({
    packageJson: {
      dependencies: { '@ankhorage/unrelated': '^1.0.0' },
      ankh: { category: 'fixture', provider: null, capabilities: [] },
      exports: { './capabilities': './dist/capabilities/index.js' },
    },
    extraFiles: {
      'node_modules/@ankhorage/unrelated/package.json': JSON.stringify({
        name: '@ankhorage/unrelated',
        exports: { './schema': './schema.js' },
      }),
      'node_modules/@ankhorage/unrelated/schema.js': 'export const CAPABILITIES = [];\n',
      'src/capabilities/index.ts': `import { CAPABILITIES as EXTERNAL_CAPABILITIES } from '@ankhorage/unrelated/schema';

export const CAPABILITIES = EXTERNAL_CAPABILITIES;
`,
    },
  });

  const result = await analyzeDoctorTarget({ cwd: fixture, mode: 'package' });

  expect(catalogDiagnostics(result)).toEqual([catalogRule]);
  expect(result.diagnostics.map((diagnostic) => diagnostic.message).join('\n')).toContain(
    'Contracts public exports',
  );
});

/*** Select the diagnostics emitted by canonical catalog validation. */
function catalogDiagnostics(result: Awaited<ReturnType<typeof analyzeDoctorTarget>>): string[] {
  return result.diagnostics
    .map((diagnostic) => diagnostic.ruleId)
    .filter((ruleId) => ruleId === catalogRule);
}

/*** Create one exact static capability descriptor for a fixture catalog. */
function createCapability(id: string) {
  return {
    id,
    owner: '@ankhorage/fixture',
    access: ['invoke'],
    binding: { kind: 'action', bindableAs: ['target'] },
  };
}
