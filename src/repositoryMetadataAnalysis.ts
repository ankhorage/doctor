import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { RepositoryMetadataFact } from '@ankhorage/rules-repository';
import {
  decodeRepositoryMetadata,
  evaluateRepositoryMetadataPreflight,
  REPOSITORY_RULE_METADATA,
} from '@ankhorage/rules-repository';

import type {
  DoctorAnalysisRequest,
  DoctorAnalysisResult,
  DoctorRepositoryMetadataOptions,
} from './analysis.js';
import type { DoctorDiagnostic, DoctorDiagnosticSeverity, DoctorRuleId } from './diagnostics.js';

/*** Acquire repository metadata at the filesystem boundary and evaluate it through published Rules. */
export async function analyzeRepositoryMetadata(
  result: DoctorAnalysisResult,
  request: DoctorAnalysisRequest,
): Promise<DoctorAnalysisResult> {
  const packageJson = await readPackageJsonAsync(result.targetPath);
  const metadata = await acquireRepositoryMetadataAsync(
    result.targetPath,
    packageJson,
    request.repositoryMetadata,
  );
  const diagnostics = [
    ...result.diagnostics,
    ...metadata.diagnostics,
    ...(metadata.evaluate
      ? evaluateMetadataPreflight(
          metadata.fact,
          result.targetPath,
          request.repositoryMetadata?.enforce,
        )
      : []),
  ];

  return { ...result, diagnostics };
}

interface RepositoryMetadataAcquisition {
  readonly diagnostics: readonly DoctorDiagnostic[];
  readonly evaluate: boolean;
  readonly fact: RepositoryMetadataFact;
}

/*** Read package identity without allowing malformed package JSON to make metadata enforcement broader. */
async function readPackageJsonAsync(targetPath: string): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = JSON.parse(
      await fs.readFile(path.join(targetPath, 'package.json'), 'utf8'),
    );
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

/*** Acquire only canonical JSON metadata and never execute target repository source code. */
async function acquireRepositoryMetadataAsync(
  targetPath: string,
  packageJson: Record<string, unknown> | null,
  options: DoctorRepositoryMetadataOptions | undefined,
): Promise<RepositoryMetadataAcquisition> {
  const managed = isManagedAnkhorageRepository(packageJson);
  const eligibility = options?.eligibility ?? (managed ? 'applicable' : 'third-party');
  const profile = options?.profile ?? (await detectMetadataProfileAsync(targetPath));
  const canonicalPath = canonicalMetadataPath(profile);
  const metadataPath = path.join(targetPath, canonicalPath);

  if (eligibility !== 'applicable' || !managed) {
    return { diagnostics: [], evaluate: true, fact: { eligibility, managed, profile } };
  }

  let source: string;
  try {
    source = await fs.readFile(metadataPath, 'utf8');
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) {
      return { diagnostics: [], evaluate: true, fact: { eligibility, managed, profile } };
    }

    return {
      diagnostics: [
        createMetadataDiagnostic({
          code: 'repository-metadata-unreadable',
          message: 'Repository metadata could not be read: ' + describeError(error),
          path: metadataPath,
          ruleId: 'repository.metadata.document.valid',
          severity: metadataSeverity(options?.enforce),
        }),
      ],
      evaluate: false,
      fact: { eligibility, managed, path: canonicalPath, profile },
    };
  }

  return decodeMetadataSource(
    source,
    { eligibility, managed, path: canonicalPath, profile },
    metadataPath,
    options?.enforce,
  );
}

/*** Parse and decode metadata while keeping syntax errors distinct from structural decoder findings. */
function decodeMetadataSource(
  source: string,
  fact: RepositoryMetadataFact,
  metadataPath: string,
  enforce: boolean | undefined,
): RepositoryMetadataAcquisition {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source) as unknown;
  } catch (error) {
    return invalidMetadataAcquisition(
      fact,
      metadataPath,
      'Repository metadata contains invalid JSON: ' + describeError(error),
      enforce,
    );
  }

  const decoded = decodeRepositoryMetadata(parsed);
  if (!decoded.ok) {
    return {
      diagnostics: decoded.diagnostics.map((diagnostic) =>
        createMetadataDiagnostic({
          code: 'invalid-repository-metadata',
          message: diagnostic.message,
          path: metadataPath + diagnostic.path,
          ruleId: 'repository.metadata.document.valid',
          severity: metadataSeverity(enforce),
        }),
      ),
      evaluate: false,
      fact,
    };
  }

  return { diagnostics: [], evaluate: true, fact: { ...fact, document: decoded.document } };
}

/*** Return one invalid-document result without falsely reporting that the document is missing. */
function invalidMetadataAcquisition(
  fact: RepositoryMetadataFact,
  metadataPath: string,
  message: string,
  enforce: boolean | undefined,
): RepositoryMetadataAcquisition {
  return {
    diagnostics: [
      createMetadataDiagnostic({
        code: 'invalid-repository-metadata',
        message,
        path: metadataPath,
        ruleId: 'repository.metadata.document.valid',
        severity: metadataSeverity(enforce),
      }),
    ],
    evaluate: false,
    fact,
  };
}

/*** Derive the profile-owned location from real source ownership unless a host explicitly supplies it. */
async function detectMetadataProfileAsync(targetPath: string): Promise<'non-source' | 'source'> {
  try {
    return (await fs.stat(path.join(targetPath, 'src'))).isDirectory() ? 'source' : 'non-source';
  } catch {
    return 'non-source';
  }
}

/*** Evaluate canonical metadata policy using only acquired portable facts. */
function evaluateMetadataPreflight(
  metadata: RepositoryMetadataFact,
  targetPath: string,
  enforce: boolean | undefined,
): readonly DoctorDiagnostic[] {
  return evaluateRepositoryMetadataPreflight({
    cliCommands: [],
    imports: [],
    metadata,
    packageJson: { dependencies: [], exports: [], fields: {}, scripts: {} },
    paths: [],
    workflowBunVersions: {},
  }).findings.map((finding) =>
    createMetadataDiagnostic({
      code: 'field-invalid',
      message: finding.message,
      path: path.join(
        targetPath,
        finding.subjects[0]?.path ?? canonicalMetadataPath(metadata.profile),
      ),
      ruleId: finding.ruleId as DoctorRuleId,
      severity: metadataSeverity(enforce),
    }),
  );
}

/*** Use published Rules path policy instead of reproducing metadata path literals in Doctor. */
function canonicalMetadataPath(profile: 'non-source' | 'source'): string {
  return profile === 'source'
    ? REPOSITORY_RULE_METADATA.metadata.profiles.source.canonicalPath
    : REPOSITORY_RULE_METADATA.metadata.profiles.nonSource.canonicalPath;
}

/*** Keep rollout enforcement explicitly scoped to package identities owned by Ankhorage. */
function isManagedAnkhorageRepository(packageJson: Record<string, unknown> | null): boolean {
  return typeof packageJson?.name === 'string' && packageJson.name.startsWith('@ankhorage/');
}

/*** Promote preflight findings only through the explicit Doctor activation request. */
function metadataSeverity(enforce: boolean | undefined): DoctorDiagnosticSeverity {
  return enforce === true ? 'error' : 'warning';
}

/*** Preserve stable Doctor diagnostic structure for Rules and decoder findings. */
function createMetadataDiagnostic(input: {
  readonly code: DoctorDiagnostic['code'];
  readonly message: string;
  readonly path: string;
  readonly ruleId: DoctorRuleId;
  readonly severity: DoctorDiagnosticSeverity;
}): DoctorDiagnostic {
  return {
    code: input.code,
    message: input.message,
    path: input.path,
    profile: 'unknown',
    ruleId: input.ruleId,
    severity: input.severity,
  };
}

/*** Identify filesystem absence without treating other read failures as missing metadata. */
function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}

/*** Render parser and filesystem failures without exposing an implementation-specific exception shape. */
function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/*** Narrow package JSON to the object shape needed for managed-repository identification. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
