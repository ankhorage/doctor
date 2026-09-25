import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { DoctorDiagnostic, DoctorPolicyProfile } from './diagnostics.js';

interface SourceImport {
  readonly filePath: string;
  readonly specifier: string;
}

interface AnalyzeSourceArchitectureInput {
  readonly activeSourceImports: readonly SourceImport[];
  readonly profile: DoctorPolicyProfile;
  readonly targetPath: string;
}

const CATCH_ALL_DIRECTORIES = ['common', 'helpers', 'shared'] as const;
const INNER_ROLE_SEGMENTS = new Set(['domain', 'core']);
const APPLICATION_ROLE_SEGMENTS = new Set(['application']);
const PORT_ROLE_SEGMENTS = new Set(['ports']);
const DOMAIN_OUTWARD_SEGMENTS = new Set([
  'adapters',
  'app',
  'application',
  'cli',
  'composition',
  'host',
  'infrastructure',
  'platform',
]);
const APPLICATION_OUTWARD_SEGMENTS = new Set([
  'adapters',
  'app',
  'cli',
  'composition',
  'host',
  'infrastructure',
  'platform',
]);
const PORT_OUTWARD_SEGMENTS = APPLICATION_OUTWARD_SEGMENTS;
const INWARD_FEATURE_ROLES = ['application', 'contracts', 'domain', 'planning', 'ports'] as const;

/*** Validate folder-role combinations and inward source dependency direction. */
export async function analyzeSourceArchitecture(
  input: AnalyzeSourceArchitectureInput,
): Promise<DoctorDiagnostic[]> {
  return [
    ...(await analyzeDirectoryVocabularyAsync(input)),
    ...analyzeImportDirection(input),
  ];
}

/*** Validate architectural directory names only when a repository has introduced them. */
async function analyzeDirectoryVocabularyAsync(
  input: AnalyzeSourceArchitectureInput,
): Promise<DoctorDiagnostic[]> {
  const diagnostics: DoctorDiagnostic[] = [];
  const sourceRoot = path.join(input.targetPath, 'src');

  for (const directoryName of CATCH_ALL_DIRECTORIES) {
    const directoryPath = path.join(sourceRoot, directoryName);
    if (await pathExistsAsync(directoryPath)) {
      diagnostics.push(
        createDiagnostic(
          input,
          directoryPath,
          'package.architecture.catch-all-directory.disallowed',
          `src/${directoryName}/ is a generic catch-all. Move code to an owning domain, feature, package edge, or utils/ according to the repository profile.`,
        ),
      );
    }
  }

  diagnostics.push(...(await analyzeFeatureCombinationsAsync(input, sourceRoot)));
  return diagnostics;
}

/*** Validate feature-first role combinations without requiring unused ceremonial layers. */
async function analyzeFeatureCombinationsAsync(
  input: AnalyzeSourceArchitectureInput,
  sourceRoot: string,
): Promise<DoctorDiagnostic[]> {
  const featuresRoot = path.join(sourceRoot, 'features');
  if (!(await pathExistsAsync(featuresRoot))) return [];

  const featureEntries = (await fs.readdir(featuresRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name));
  const diagnostics: DoctorDiagnostic[] = [];

  for (const entry of featureEntries) {
    const featureRoot = path.join(featuresRoot, entry.name);
    const roleNames = new Set(
      (await fs.readdir(featureRoot, { withFileTypes: true }))
        .filter((child) => child.isDirectory())
        .map((child) => child.name),
    );
    const hasInwardRole = INWARD_FEATURE_ROLES.some((role) => roleNames.has(role));

    if (roleNames.has('adapters') && !hasInwardRole) {
      diagnostics.push(
        createDiagnostic(
          input,
          path.join(featureRoot, 'adapters'),
          'package.architecture.role-combination.invalid',
          `Feature "${entry.name}" declares adapters/ without domain, application, ports, contracts, or planning policy to adapt to.`,
        ),
      );
    }

    if (
      roleNames.has('composition') &&
      !['adapters', 'application', 'ports', 'planning'].some((role) => roleNames.has(role))
    ) {
      diagnostics.push(
        createDiagnostic(
          input,
          path.join(featureRoot, 'composition'),
          'package.architecture.role-combination.invalid',
          `Feature "${entry.name}" declares composition/ without application, ports, planning, or adapters to wire.`,
        ),
      );
    }
  }

  return diagnostics;
}

/*** Validate that relative source imports point inward across recognized architecture roles. */
function analyzeImportDirection(input: AnalyzeSourceArchitectureInput): DoctorDiagnostic[] {
  return input.activeSourceImports.flatMap((sourceImport) =>
    analyzeOneImportDirection(input, sourceImport),
  );
}

/*** Validate one relative import against repository and layer boundaries. */
function analyzeOneImportDirection(
  input: AnalyzeSourceArchitectureInput,
  sourceImport: SourceImport,
): DoctorDiagnostic[] {
  if (!sourceImport.specifier.startsWith('.')) return [];

  const targetPath = path.resolve(path.dirname(sourceImport.filePath), sourceImport.specifier);
  const relativeTarget = path.relative(input.targetPath, targetPath);
  if (relativeTarget.startsWith('..') || path.isAbsolute(relativeTarget)) {
    return [
      createDiagnostic(
        input,
        sourceImport.filePath,
        'package.imports.outside-root.disallowed',
        `Relative import "${sourceImport.specifier}" escapes the standalone repository root.`,
      ),
    ];
  }

  const sourceSegments = splitRelativePath(input.targetPath, sourceImport.filePath);
  const targetSegments = splitRelativePath(input.targetPath, targetPath);
  if (sourceSegments.some((segment) => INNER_ROLE_SEGMENTS.has(segment))) {
    return createOutwardImportDiagnostic(
      input,
      sourceImport,
      targetSegments,
      DOMAIN_OUTWARD_SEGMENTS,
      'package.architecture.domain-outward-import.disallowed',
      'Domain/core policy',
    );
  }
  if (sourceSegments.some((segment) => APPLICATION_ROLE_SEGMENTS.has(segment))) {
    return createOutwardImportDiagnostic(
      input,
      sourceImport,
      targetSegments,
      APPLICATION_OUTWARD_SEGMENTS,
      'package.architecture.application-outward-import.disallowed',
      'Application/use-case code',
    );
  }
  if (sourceSegments.some((segment) => PORT_ROLE_SEGMENTS.has(segment))) {
    return createOutwardImportDiagnostic(
      input,
      sourceImport,
      targetSegments,
      PORT_OUTWARD_SEGMENTS,
      'package.architecture.port-outward-import.disallowed',
      'Port contracts',
    );
  }

  return [];
}

/*** Report one outward dependency when the imported path crosses a forbidden role. */
function createOutwardImportDiagnostic(
  input: AnalyzeSourceArchitectureInput,
  sourceImport: SourceImport,
  targetSegments: readonly string[],
  forbiddenSegments: ReadonlySet<string>,
  ruleId:
    | 'package.architecture.application-outward-import.disallowed'
    | 'package.architecture.domain-outward-import.disallowed'
    | 'package.architecture.port-outward-import.disallowed',
  roleLabel: string,
): DoctorDiagnostic[] {
  const outwardRole = targetSegments.find((segment) => forbiddenSegments.has(segment));
  if (outwardRole === undefined) return [];

  return [
    createDiagnostic(
      input,
      sourceImport.filePath,
      ruleId,
      `${roleLabel} must not import outward ${outwardRole}/ implementation through "${sourceImport.specifier}".`,
    ),
  ];
}

/*** Split one repository path into normalized architecture segments. */
function splitRelativePath(targetPath: string, filePath: string): readonly string[] {
  return path.relative(targetPath, filePath).split(path.sep).filter(Boolean);
}

/*** Build one deterministic architecture diagnostic. */
function createDiagnostic(
  input: AnalyzeSourceArchitectureInput,
  diagnosticPath: string,
  ruleId: DoctorDiagnostic['ruleId'],
  message: string,
): DoctorDiagnostic {
  return {
    code: 'field-invalid',
    message,
    path: diagnosticPath,
    profile: input.profile,
    ruleId,
    severity: 'error',
  };
}

/*** Check whether a filesystem path exists. */
async function pathExistsAsync(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
