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

type ArchitectureRule =
  (typeof ARCHITECTURE_POLICY.rules)[keyof typeof ARCHITECTURE_POLICY.rules];
type ArchitectureRuleId = ArchitectureRule['id'];

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

  for (const directoryName of ARCHITECTURE_POLICY.source.catchAllDirectories) {
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

    diagnostics.push(
      ...validateFeatureRoleCombination({
        entryName: entry.name,
        featureRoot,
        roleNames,
        role: 'adapters',
        policy: ARCHITECTURE_POLICY.source.featureCombinations.adapters,
        message:
          'declares adapters/ without domain, application, ports, contracts, or planning policy to adapt to.',
        input,
      }),
      ...validateFeatureRoleCombination({
        entryName: entry.name,
        featureRoot,
        roleNames,
        role: 'composition',
        policy: ARCHITECTURE_POLICY.source.featureCombinations.composition,
        message: 'declares composition/ without application, ports, planning, or adapters to wire.',
        input,
      }),
    );
  }

  return diagnostics;
}

interface FeatureCombinationPolicy {
  readonly requiresAnyOf: readonly string[];
  readonly ruleId: ArchitectureRuleId;
}

/*** Validate one optional feature role against its required companion roles. */
function validateFeatureRoleCombination(request: {
  readonly entryName: string;
  readonly featureRoot: string;
  readonly input: AnalyzeSourceArchitectureInput;
  readonly message: string;
  readonly policy: FeatureCombinationPolicy;
  readonly role: string;
  readonly roleNames: ReadonlySet<string>;
}): DoctorDiagnostic[] {
  if (!request.roleNames.has(request.role)) return [];
  if (request.policy.requiresAnyOf.some((role) => request.roleNames.has(role))) return [];

  return [
    createDiagnostic(
      request.input,
      path.join(request.featureRoot, request.role),
      findArchitectureRule(request.policy.ruleId),
      `Feature "${request.entryName}" ${request.message}`,
    ),
  ];
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
    findArchitectureRule(ARCHITECTURE_POLICY.source.repositoryBoundaryRuleId),
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

  if (
    isThinDeliveryAdapter(sourceSegments) &&
    targetSegments.includes(ARCHITECTURE_POLICY.source.thinDeliveryAdapter.concreteAdapterSegment)
  ) {
    return [
      createDiagnostic(
        input,
        sourceImport.filePath,
        findArchitectureRule(ARCHITECTURE_POLICY.source.thinDeliveryAdapter.ruleId),
        `Thin delivery adapter must not wire concrete adapter implementation through "${sourceImport.specifier}". Import an application operation or composition boundary instead.`,
      ),
    ];
  }

  const role = resolveSourceRole(sourceSegments);
  if (role === null) return [];

  const outwardRole = role.forbiddenOutwardSegments.find((segment) =>
    targetSegments.includes(segment),
  );
  if (outwardRole === undefined) return [];

  return [
    createDiagnostic(
      input,
      sourceImport.filePath,
      findArchitectureRule(role.ruleId),
      `${role.label} must not import outward ${outwardRole}/ implementation through "${sourceImport.specifier}".`,
    ),
  ];
}

/*** Check whether a source file belongs to a thin CLI command delivery boundary. */
function isThinDeliveryAdapter(sourceSegments: readonly string[]): boolean {
  const [cliSegment, commandSegment] = ARCHITECTURE_POLICY.source.thinDeliveryAdapter.pathSegments;
  const cliIndex = sourceSegments.indexOf(cliSegment);
  return cliIndex >= 0 && sourceSegments[cliIndex + 1] === commandSegment;
}

/*** Resolve the dependency rule owned by one recognized inner source role. */
function resolveSourceRole(sourceSegments: readonly string[]) {
  return (
    Object.values(ARCHITECTURE_POLICY.source.roles).find((role) =>
      role.segments.some((segment) => sourceSegments.includes(segment)),
    ) ?? null
  );
}

/*** Resolve one architecture rule descriptor by stable Policy id. */
function findArchitectureRule(ruleId: ArchitectureRuleId): ArchitectureRule {
  const rule = Object.values(ARCHITECTURE_POLICY.rules).find((entry) => entry.id === ruleId);
  if (rule === undefined) {
    throw new Error(`Unknown architecture policy rule: ${ruleId}`);
  }
  return rule;
}

/*** Split one repository path into normalized architecture segments. */
function splitRelativePath(targetPath: string, filePath: string): readonly string[] {
  return path.relative(targetPath, filePath).split(path.sep).filter(Boolean);
}

/*** Build one deterministic architecture diagnostic from Policy rule metadata. */
function createDiagnostic(
  input: AnalyzeSourceArchitectureInput,
  diagnosticPath: string,
  rule: ArchitectureRule,
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
