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
    analyze(archivedFixture, { eligibility: 'archived', enforce: true }),
    analyze(thirdPartyFixture, { enforce: true }),
  ]);

  expect(metadataDiagnostics(archived.diagnostics)).toEqual([]);
  expect(metadataDiagnostics(thirdParty.diagnostics)).toEqual([]);
});

test('exposes metadata enforcement as an explicit standalone CLI activation flag', async () => {
  const fixture = await createManagedFixture();
  const reportOnly = createCapturedCommandContext(fixture);
  const enforced = createCapturedCommandContext(fixture);

  expect((await runCli(['validate'], { context: reportOnly.context })).exitCode).toBe(0);
  expect(
    (await runCli(['validate', '--enforce-repository-metadata'], { context: enforced.context }))
      .exitCode,
  ).toBe(1);
  expect(reportOnly.stdout.value).toContain('WARNING repository.metadata.document.required');
  expect(enforced.stdout.value).toContain('ERROR repository.metadata.document.required');
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
    readonly eligibility?: 'archived';
    readonly enforce?: boolean;
    readonly profile?: 'non-source';
  } = {},
) {
  return analyzeDoctorTargetWithCliLayout({ cwd, mode: 'validate', repositoryMetadata });
}

function metadataDiagnostics(
  diagnostics: readonly DoctorDiagnostic[],
): readonly DoctorDiagnostic[] {
  return diagnostics.filter(({ ruleId }) => ruleId.startsWith('repository.metadata.'));
}
