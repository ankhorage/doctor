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
