import { promises as fs } from 'node:fs';
import path from 'node:path';

import { ARCHITECTURE_POLICY } from '@ankhorage/policy/architecture';

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

type ArchitecturePolicyRule =
  (typeof ARCHITECTURE_POLICY.rules)[keyof typeof ARCHITECTURE_POLICY.rules];

const SOURCE_POLICY = ARCHITECTURE_POLICY.source;

/*** Validate folder-role combinations and inward source dependency direction. */
export async function analyzeSourceArchitecture(
  input: AnalyzeSourceArchitectureInput,
): Promise<DoctorDiagnostic[]> {
  return [...(await analyzeDirectoryVocabularyAsync(input)), ...analyzeImportDirection(input)];
}

/*** Validate architectural directory names only when a repository has introduced them. */
async function analyzeDirectoryVocabularyAsync(
  input: AnalyzeSourceArchitectureInput,
): Promise<DoctorDiagnostic[]> {
  const diagnostics: DoctorDiagnostic[] = [];
  const sourceRoot = path.join(input.targetPath, 'src');

  for (const directoryName of SOURCE_POLICY.catchAllDirectories) {
    const directoryPath = path.join(sourceRoot, directoryName);
    if (await pathExistsAsync(directoryPath)) {
      diagnostics.push(
        createDiagnostic(
          input,
          directoryPath,
          ARCHITECTURE_POLICY.rules.catchAllDirectory,
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

    for (const [roleName, requirement] of Object.entries(SOURCE_POLICY.featureCombinations)) {
      if (
        roleNames.has(roleName) &&
        !requirement.requiresAnyOf.some((requiredRole) => roleNames.has(requiredRole))
      ) {
        diagnostics.push(
          createDiagnostic(
            input,
            path.join(featureRoot, roleName),
            getArchitectureRule(requirement.ruleId),
            `Feature "${entry.name}" declares ${roleName}/ without one of the required inward roles: ${requirement.requiresAnyOf.join(', ')}.`,
          ),
        );
      }
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
  const escaped = createEscapedRepositoryDiagnostic(input, sourceImport, targetPath);
  if (escaped !== null) return [escaped];

  return analyzeRecognizedRoleDirection(input, sourceImport, targetPath);
}

/*** Report a relative import that escapes the standalone repository boundary. */
function createEscapedRepositoryDiagnostic(
  input: AnalyzeSourceArchitectureInput,
  sourceImport: SourceImport,
  targetPath: string,
): DoctorDiagnostic | null {
  const relativeTarget = path.relative(input.targetPath, targetPath);
  if (!relativeTarget.startsWith('..') && !path.isAbsolute(relativeTarget)) return null;

  return createDiagnostic(
    input,
    sourceImport.filePath,
    getArchitectureRule(SOURCE_POLICY.repositoryBoundaryRuleId),
    `Relative import "${sourceImport.specifier}" escapes the standalone repository root.`,
  );
}

/*** Apply inward dependency rules for recognized source architecture roles. */
function analyzeRecognizedRoleDirection(
  input: AnalyzeSourceArchitectureInput,
  sourceImport: SourceImport,
  targetPath: string,
): DoctorDiagnostic[] {
  const sourceSegments = splitRelativePath(input.targetPath, sourceImport.filePath);
  const targetSegments = splitRelativePath(input.targetPath, targetPath);
  const deliveryPolicy = SOURCE_POLICY.thinDeliveryAdapter;

  if (
    includesSegmentSequence(sourceSegments, deliveryPolicy.pathSegments) &&
    targetSegments.includes(deliveryPolicy.concreteAdapterSegment)
  ) {
    return [
      createDiagnostic(
        input,
        sourceImport.filePath,
        getArchitectureRule(deliveryPolicy.ruleId),
        `Thin delivery adapter must not wire concrete adapter implementation through "${sourceImport.specifier}". Import an application operation or composition boundary instead.`,
      ),
    ];
  }

  const role = resolveSourceRole(sourceSegments);
  if (role === null) return [];

  return createOutwardImportDiagnostic(input, sourceImport, targetSegments, role);
}

/*** Resolve the dependency rule owned by one recognized inner source role. */
function resolveSourceRole(sourceSegments: readonly string[]): SourceRoleRule | null {
  for (const role of Object.values(SOURCE_POLICY.roles)) {
    if (sourceSegments.some((segment) => role.segments.includes(segment))) {
      return {
        forbiddenSegments: new Set<string>(role.forbiddenOutwardSegments),
        label: role.label,
        rule: getArchitectureRule(role.ruleId),
      };
    }
  }

  return null;
}

interface SourceRoleRule {
  readonly forbiddenSegments: ReadonlySet<string>;
  readonly label: string;
  readonly rule: ArchitecturePolicyRule;
}

/*** Report one outward dependency when the imported path crosses a forbidden role. */
function createOutwardImportDiagnostic(
  input: AnalyzeSourceArchitectureInput,
  sourceImport: SourceImport,
  targetSegments: readonly string[],
  role: SourceRoleRule,
): DoctorDiagnostic[] {
  const outwardRole = targetSegments.find((segment) => role.forbiddenSegments.has(segment));
  if (outwardRole === undefined) return [];

  return [
    createDiagnostic(
      input,
      sourceImport.filePath,
      role.rule,
      `${role.label} must not import outward ${outwardRole}/ implementation through "${sourceImport.specifier}".`,
    ),
  ];
}

/*** Check whether one path segment sequence occurs contiguously in another. */
function includesSegmentSequence(
  segments: readonly string[],
  expected: readonly string[],
): boolean {
  return segments.some((_, index) =>
    expected.every((segment, offset) => segments[index + offset] === segment),
  );
}

/*** Split one repository path into normalized architecture segments. */
function splitRelativePath(targetPath: string, filePath: string): readonly string[] {
  return path.relative(targetPath, filePath).split(path.sep).filter(Boolean);
}

/*** Resolve a Policy-owned rule descriptor by its stable id. */
function getArchitectureRule(ruleId: string): ArchitecturePolicyRule {
  const rule = Object.values(ARCHITECTURE_POLICY.rules).find((entry) => entry.id === ruleId);
  if (rule === undefined) {
    throw new Error(`Unknown architecture policy rule: ${ruleId}`);
  }
  return rule;
}

/*** Build one deterministic architecture diagnostic from Policy-owned metadata. */
function createDiagnostic(
  input: AnalyzeSourceArchitectureInput,
  diagnosticPath: string,
  rule: ArchitecturePolicyRule,
  message: string,
): DoctorDiagnostic {
  return {
    code: 'field-invalid',
    message,
    path: diagnosticPath,
    profile: input.profile,
    ruleId: rule.id,
    severity: rule.severity,
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
