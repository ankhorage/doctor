import { expect, test } from 'bun:test';

import { runCli } from '../src/cli/standalone.js';
import { analyzeDoctorTargetWithCliLayout } from '../src/dependencyPolicyAnalysis.js';
import type { DoctorDiagnostic } from '../src/diagnostics.js';
import { createCapturedCommandContext, createDoctorFixture } from './testSupport.js';

const METADATA = {
  schemaVersion: 1,
  kind: 'tooling',
  title: 'Fixture Doctor',
  summary: 'Provides deterministic repository metadata diagnostics.',
  purpose: 'Exercise the published repository metadata rules.',
  responsibilities: ['Read canonical metadata JSON.'],
  boundaries: ['Does not execute repository TypeScript.'],
  audience: ['Repository maintainers.'],
  useCases: ['Validate repository metadata.'],
};

test('reports missing managed source metadata without blocking before explicit activation', async () => {
  const fixture = await createManagedFixture();

  const result = await analyze(fixture);
  const [diagnostic] = metadataDiagnostics(result.diagnostics);

  expect(diagnostic?.ruleId).toBe('repository.metadata.document.required');
  expect(diagnostic?.severity).toBe('warning');
});

test('blocks missing managed source metadata through the explicit enforcement activation', async () => {
  const fixture = await createManagedFixture();

  const result = await analyze(fixture, { enforce: true });
  const [diagnostic] = metadataDiagnostics(result.diagnostics);

  expect(diagnostic?.ruleId).toBe('repository.metadata.document.required');
  expect(diagnostic?.severity).toBe('error');
});

test('enforces missing and invalid metadata for an explicitly managed unscoped source repository', async () => {
  const missingFixture = await createDoctorFixture({
    packageJson: { name: 'ch-akontaxi', private: true },
    extraFiles: { 'src/index.ts': 'export const fixture = true;\n' },
  });
  const invalidFixture = await createDoctorFixture({
    packageJson: { name: 'ch-akontaxi', private: true },
    extraFiles: { 'src/metadata/repository.json': '{not json' },
  });

  const [missing, invalid] = await Promise.all([
    analyze(missingFixture, { enforce: true, managed: true }),
    analyze(invalidFixture, { enforce: true, managed: true }),
  ]);

  expect(metadataDiagnostics(missing.diagnostics)).toMatchObject([
    { ruleId: 'repository.metadata.document.required', severity: 'error' },
  ]);
  expect(metadataDiagnostics(invalid.diagnostics)).toMatchObject([
    { ruleId: 'repository.metadata.document.valid', severity: 'error' },
  ]);
});

test('enforces missing source and invalid non-source metadata for explicitly managed package-less repositories', async () => {
  const missingSourceFixture = await createDoctorFixture({
    packageJson: null,
    extraFiles: { 'src/index.ts': 'export const fixture = true;\n' },
  });
  const invalidNonSourceFixture = await createDoctorFixture({
    packageJson: null,
    extraFiles: { 'metadata/repository.json': '{not json' },
  });

  const [missing, invalid] = await Promise.all([
    analyze(missingSourceFixture, { enforce: true, managed: true }),
    analyze(invalidNonSourceFixture, { enforce: true, managed: true, profile: 'non-source' }),
  ]);

  expect(metadataDiagnostics(missing.diagnostics)).toMatchObject([
    { ruleId: 'repository.metadata.document.required', severity: 'error' },
  ]);
  expect(metadataDiagnostics(invalid.diagnostics)).toMatchObject([
    { ruleId: 'repository.metadata.document.valid', severity: 'error' },
  ]);
});

test('distinguishes syntax errors from missing metadata files', async () => {
  const fixture = await createManagedFixture({
    'src/metadata/repository.json': '{not json',
  });

  const result = await analyze(fixture, { enforce: true });
  const diagnostics = metadataDiagnostics(result.diagnostics);

  expect(diagnostics).toHaveLength(1);
  expect(diagnostics[0]).toMatchObject({
    code: 'invalid-repository-metadata',
    ruleId: 'repository.metadata.document.valid',
    severity: 'error',
  });
});

test('uses the published decoder for structural findings and preserves its JSON pointer', async () => {
  const fixture = await createManagedFixture({
    'src/metadata/repository.json': JSON.stringify({ schemaVersion: 1 }),
  });

  const result = await analyze(fixture, { enforce: true });
  const diagnostics = metadataDiagnostics(result.diagnostics);

  expect(diagnostics.some(({ path }) => path.endsWith('#/kind'))).toBe(true);
  expect(diagnostics.every(({ severity }) => severity === 'error')).toBe(true);
  expect(diagnostics.some(({ ruleId }) => ruleId === 'repository.metadata.document.required')).toBe(
    false,
  );
});

test('evaluates valid source metadata through canonical Rules without executing target TypeScript', async () => {
  const fixture = await createManagedFixture({
    'src/index.ts': "throw new Error('Doctor must not execute this source file.');\n",
    'src/metadata/repository.json': JSON.stringify(METADATA),
  });

  const result = await analyze(fixture, { enforce: true });

  expect(metadataDiagnostics(result.diagnostics)).toEqual([]);
});

test('accepts ZORA independent native and web build targets through published Rules', async () => {
  const fixture = await createManagedFixture({
    'src/metadata/repository.json': JSON.stringify({
      ...METADATA,
      build: {
        targets: {
          native: {
            language: 'typescript',
            framework: 'react-native',
            platforms: ['ios', 'android', 'web'],
            entry: '.',
            outDir: 'dist',
            sources: { include: ['src/**/*.ts', 'src/**/*.tsx'] },
            builder: { script: 'build' },
          },
          web: {
            language: 'typescript',
            framework: 'react',
            platforms: ['web'],
            entry: './web/*',
            outDir: 'web-dist',
            sources: { include: ['src/features/**/public.ts', 'src/authoring.browser.ts'] },
            builder: { script: 'build' },
          },
        },
      },
    }),
  });

  const result = await analyze(fixture, { enforce: true });

  expect(metadataDiagnostics(result.diagnostics)).toEqual([]);
});

test('promotes canonical preflight policy findings only through explicit activation', async () => {
  const fixture = await createManagedFixture({
    'src/metadata/repository.json': JSON.stringify({ ...METADATA, title: 'TODO' }),
  });

  const reportOnly = await analyze(fixture);
  const enforced = await analyze(fixture, { enforce: true });

  expect(
    metadataDiagnostics(reportOnly.diagnostics).some(
      ({ ruleId, severity }) =>
        ruleId === 'repository.metadata.text.meaningful' && severity === 'warning',
    ),
  ).toBe(true);
  expect(
    metadataDiagnostics(enforced.diagnostics).some(
      ({ ruleId, severity }) =>
        ruleId === 'repository.metadata.text.meaningful' && severity === 'error',
    ),
  ).toBe(true);
});

test('reports source metadata authored at the non-source path as a Rules location finding', async () => {
  const fixture = await createManagedFixture({
    'metadata/repository.json': JSON.stringify(METADATA),
  });

  const diagnostics = metadataDiagnostics((await analyze(fixture, { enforce: true })).diagnostics);

  expect(diagnostics).toEqual([
    expect.objectContaining({
      path: `${fixture}/metadata/repository.json`,
      ruleId: 'repository.metadata.location.canonical',
      severity: 'error',
    }),
  ]);
});

test('reports non-source metadata authored at the source path as a Rules location finding', async () => {
  const fixture = await createDoctorFixture({
    packageJson: null,
    extraFiles: { 'src/metadata/repository.json': JSON.stringify(METADATA) },
  });

  const diagnostics = metadataDiagnostics(
    (await analyze(fixture, { enforce: true, managed: true, profile: 'non-source' })).diagnostics,
  );

  expect(diagnostics).toEqual([
    expect.objectContaining({
      path: `${fixture}/src/metadata/repository.json`,
      ruleId: 'repository.metadata.location.canonical',
      severity: 'error',
    }),
  ]);
});

test('uses the expected metadata path when both profile paths are authored', async () => {
  const fixture = await createManagedFixture({
    'metadata/repository.json': JSON.stringify(METADATA),
    'src/metadata/repository.json': JSON.stringify(METADATA),
  });

  expect(metadataDiagnostics((await analyze(fixture, { enforce: true })).diagnostics)).toEqual([]);
});

test('anchors Rules title and implements JSON pointers to the discovered metadata document', async () => {
  const fixture = await createManagedFixture({
    'src/metadata/repository.json': JSON.stringify({
      ...METADATA,
      implements: [{ packageName: 'fixture-package', subpath: 'not-a-public-subpath' }],
      title: 'TODO',
    }),
  });

  const diagnostics = metadataDiagnostics((await analyze(fixture, { enforce: true })).diagnostics);
  const metadataPath = `${fixture}/src/metadata/repository.json`;

  expect(diagnostics.some(({ path }) => path === `${metadataPath}#/title`)).toBe(true);
  expect(diagnostics.some(({ path }) => path === `${metadataPath}#/implements/0`)).toBe(true);
  expect(diagnostics.some(({ path }) => path.includes('/#/'))).toBe(false);
});

test('uses the non-source canonical path when the host explicitly selects that profile', async () => {
  const fixture = await createDoctorFixture({
    packageJson: { name: '@ankhorage/non-source-fixture', private: true },
    extraFiles: { 'metadata/repository.json': JSON.stringify(METADATA) },
  });

  const result = await analyze(fixture, { enforce: true, profile: 'non-source' });

  expect(metadataDiagnostics(result.diagnostics)).toEqual([]);
});

test('preserves archived and third-party exemptions during explicit enforcement', async () => {
  const archivedFixture = await createManagedFixture();
  const thirdPartyFixture = await createDoctorFixture({
    packageJson: { name: 'third-party-fixture', private: true },
    extraFiles: { 'src/index.ts': 'export const value = true;\n' },
  });

  const [archived, thirdParty] = await Promise.all([
    analyze(archivedFixture, { eligibility: 'archived', enforce: true, managed: true }),
    analyze(thirdPartyFixture, { enforce: true, managed: false }),
  ]);

  expect(metadataDiagnostics(archived.diagnostics)).toEqual([]);
  expect(metadataDiagnostics(thirdParty.diagnostics)).toEqual([]);
});

test('exposes metadata enforcement as an explicit standalone CLI activation flag', async () => {
  const fixture = await createManagedFixture();
  const reportOnly = createManagedCommandContext(fixture);
  const enforced = createManagedCommandContext(fixture);

  expect((await runCli(['validate'], { context: reportOnly.context })).exitCode).toBe(0);
  expect(
    (await runCli(['validate', '--enforce-repository-metadata'], { context: enforced.context }))
      .exitCode,
  ).toBe(1);
  expect(reportOnly.stdout.value).toContain('WARNING repository.metadata.document.required');
  expect(enforced.stdout.value).toContain('ERROR repository.metadata.document.required');
});

test('CLI enforcement blocks a managed package-less source repository without package-name inference', async () => {
  const fixture = await createDoctorFixture({
    packageJson: null,
    extraFiles: { 'src/index.ts': 'export const fixture = true;\n' },
  });
  const captured = createManagedCommandContext(fixture);

  expect(
    (await runCli(['validate', '--enforce-repository-metadata'], { context: captured.context }))
      .exitCode,
  ).toBe(1);
  expect(captured.stdout.value).toContain('ERROR repository.metadata.document.required');
});

test('explicit host-managed analysis remains applicable outside GitHub workspace inference', async () => {
  const fixture = await createDoctorFixture({
    packageJson: { name: 'unscoped-managed-fixture', private: true },
    extraFiles: { 'src/index.ts': 'export const fixture = true;\n' },
  });

  const result = await analyze(fixture, { enforce: true, managed: true });

  expect(metadataDiagnostics(result.diagnostics)).toMatchObject([
    { ruleId: 'repository.metadata.document.required', severity: 'error' },
  ]);
});

async function createManagedFixture(extraFiles: Record<string, string> = {}): Promise<string> {
  return createDoctorFixture({
    packageJson: { name: '@ankhorage/metadata-fixture', private: true },
    extraFiles: { 'src/index.ts': 'export const fixture = true;\n', ...extraFiles },
  });
}

async function analyze(
  cwd: string,
  repositoryMetadata: {
    readonly eligibility?: 'archived' | 'third-party';
    readonly enforce?: boolean;
    readonly managed?: boolean;
    readonly profile?: 'non-source' | 'source';
  } = {},
) {
  return analyzeDoctorTargetWithCliLayout({
    cwd,
    mode: 'validate',
    repositoryMetadata: { managed: true, ...repositoryMetadata },
  });
}

function createManagedCommandContext(cwd: string, workspace = cwd) {
  const captured = createCapturedCommandContext(cwd);
  return {
    ...captured,
    context: {
      ...captured.context,
      env: {
        ...captured.context.env,
        GITHUB_ACTIONS: 'true',
        GITHUB_REPOSITORY: 'ankhorage/ch-akontaxi',
        GITHUB_REPOSITORY_OWNER: 'ankhorage',
        GITHUB_WORKSPACE: workspace,
      },
    },
  };
}

function metadataDiagnostics(
  diagnostics: readonly DoctorDiagnostic[],
): readonly DoctorDiagnostic[] {
  return diagnostics.filter(({ ruleId }) => ruleId.startsWith('repository.metadata.'));
}
