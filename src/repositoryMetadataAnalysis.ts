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
  const metadata = await acquireRepositoryMetadataAsync(
    result.targetPath,
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

/*** Acquire only canonical JSON metadata and never execute target repository source code. */
async function acquireRepositoryMetadataAsync(
  targetPath: string,
  options: DoctorRepositoryMetadataOptions | undefined,
): Promise<RepositoryMetadataAcquisition> {
  const metadataOptions = options ?? {};
  const { applicabilityDiagnostic } = metadataOptions;
  if (applicabilityDiagnostic !== undefined) {
    return createUnconfirmedApplicabilityAcquisition(
      targetPath,
      applicabilityDiagnostic,
      metadataOptions.enforce,
    );
  }
  const managed = metadataOptions.managed === true;
  const eligibility = metadataOptions.eligibility ?? (managed ? 'applicable' : 'third-party');
  const profile = metadataOptions.profile ?? (await detectMetadataProfileAsync(targetPath));
  const fact = { eligibility, managed, profile } as const satisfies RepositoryMetadataFact;
  const canonicalPath = canonicalMetadataPath(profile);
  const metadataPath = path.join(targetPath, canonicalPath);

  if (eligibility !== 'applicable' || !managed) {
    return { diagnostics: [], evaluate: true, fact };
  }

  const canonicalSource = await readMetadataSourceAsync(metadataPath);
  if (canonicalSource.kind !== 'absent')
    return acquireDiscoveredMetadata(
      canonicalSource,
      canonicalPath,
      metadataPath,
      fact,
      metadataOptions.enforce,
    );

  const alternatePath = canonicalMetadataPath(oppositeProfile(profile));
  const alternateMetadataPath = path.join(targetPath, alternatePath);
  const alternateSource = await readMetadataSourceAsync(alternateMetadataPath);
  return alternateSource.kind === 'absent'
    ? { diagnostics: [], evaluate: true, fact }
    : acquireDiscoveredMetadata(
        alternateSource,
        alternatePath,
        alternateMetadataPath,
        fact,
        metadataOptions.enforce,
      );
}

/*** Surface an incomplete managed-host identity instead of guessing target applicability. */
function createUnconfirmedApplicabilityAcquisition(
  targetPath: string,
  message: string,
  enforce: boolean | undefined,
): RepositoryMetadataAcquisition {
  return {
    diagnostics: [
      createMetadataDiagnostic({
        code: 'repository-metadata-applicability-unknown',
        message,
        path: targetPath,
        ruleId: 'repository.metadata.eligibility.confirmed',
        severity: metadataSeverity(enforce),
      }),
    ],
    evaluate: false,
    fact: { eligibility: 'third-party', managed: false, profile: 'non-source' },
  };
}

type MetadataSource =
  | { readonly kind: 'absent' }
  | { readonly kind: 'present'; readonly source: string }
  | { readonly error: unknown; readonly kind: 'unreadable' };

/*** Decode one discovered metadata document or surface its filesystem failure. */
function acquireDiscoveredMetadata(
  source: Exclude<MetadataSource, { readonly kind: 'absent' }>,
  metadataPath: string,
  absoluteMetadataPath: string,
  fact: RepositoryMetadataFact,
  enforce: boolean | undefined,
): RepositoryMetadataAcquisition {
  return source.kind === 'present'
    ? decodeMetadataSource(
        source.source,
        { ...fact, path: metadataPath },
        absoluteMetadataPath,
        enforce,
      )
    : unreadableMetadataAcquisition(
        metadataPath,
        absoluteMetadataPath,
        source.error,
        enforce,
        fact,
      );
}

/*** Read metadata text while distinguishing absence from an unreadable authored document. */
async function readMetadataSourceAsync(metadataPath: string): Promise<MetadataSource> {
  try {
    return { kind: 'present', source: await fs.readFile(metadataPath, 'utf8') };
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) {
      return { kind: 'absent' };
    }

    return { error, kind: 'unreadable' };
  }
}

/*** Create one unreadable-document result at the authored canonical or alternate path. */
function unreadableMetadataAcquisition(
  metadataPath: string,
  absoluteMetadataPath: string,
  error: unknown,
  enforce: boolean | undefined,
  fact: RepositoryMetadataFact,
): RepositoryMetadataAcquisition {
  return {
    diagnostics: [
      createMetadataDiagnostic({
        code: 'repository-metadata-unreadable',
        message: 'Repository metadata could not be read: ' + describeError(error),
        path: absoluteMetadataPath,
        ruleId: 'repository.metadata.document.valid',
        severity: metadataSeverity(enforce),
      }),
    ],
    evaluate: false,
    fact: { ...fact, path: metadataPath },
  };
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
      path: resolveMetadataFindingPath(targetPath, metadata, finding.subjects[0]?.path),
      ruleId: finding.ruleId as DoctorRuleId,
      severity: metadataSeverity(enforce),
    }),
  );
}

/*** Resolve Rules document paths and RFC 6901 fragments without treating a pointer as a filesystem path. */
function resolveMetadataFindingPath(
  targetPath: string,
  metadata: RepositoryMetadataFact,
  findingPath: string | undefined,
): string {
  const documentPath = path.join(
    targetPath,
    metadata.path ?? canonicalMetadataPath(metadata.profile),
  );
  if (findingPath === undefined || findingPath.startsWith('#')) {
    return documentPath + (findingPath ?? '');
  }

  const fragmentIndex = findingPath.indexOf('#');
  const relativePath = fragmentIndex === -1 ? findingPath : findingPath.slice(0, fragmentIndex);
  const fragment = fragmentIndex === -1 ? '' : findingPath.slice(fragmentIndex);
  return path.join(targetPath, relativePath) + fragment;
}

/*** Use published Rules path policy instead of reproducing metadata path literals in Doctor. */
function canonicalMetadataPath(profile: 'non-source' | 'source'): string {
  return profile === 'source'
    ? REPOSITORY_RULE_METADATA.metadata.profiles.source.canonicalPath
    : REPOSITORY_RULE_METADATA.metadata.profiles.nonSource.canonicalPath;
}

/*** Select the other Rules-defined profile path when canonical metadata is absent. */
function oppositeProfile(profile: 'non-source' | 'source'): 'non-source' | 'source' {
  return profile === 'source' ? 'non-source' : 'source';
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
