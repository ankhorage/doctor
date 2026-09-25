import { promises as fs } from 'node:fs';
import path from 'node:path';

import { REPOSITORY_POLICY } from '@ankhorage/policy/repository';

import type { DoctorAnalysisResult } from './analysis.js';
import type { DoctorDiagnostic } from './diagnostics.js';

const BUN_POLICY = REPOSITORY_POLICY.runtime.bun;
const REPAIR_HINT = 'Run "ankh devtools sync" to repair the managed Bun state.';
const BUN_VERSION_PATTERN = /^\s*bun-version:\s*['"]?([^'"\s#]+)['"]?\s*(?:#.*)?$/mu;

type RepositoryPolicyRule = (typeof REPOSITORY_POLICY.rules)[keyof typeof REPOSITORY_POLICY.rules];
type WorkflowTarget = (typeof BUN_POLICY.workflowTargets)[number];

/***
 * Applies canonical repository Bun-policy diagnostics to a Doctor analysis result.
 */
export async function applyBunRuntimePolicy(
  result: DoctorAnalysisResult,
): Promise<DoctorAnalysisResult> {
  if (result.profile !== 'public-package' || !result.hasPackageJson) {
    return result;
  }

  const packageJsonPath = path.join(result.targetPath, 'package.json');
  const packageJson = await readPackageJson(packageJsonPath);
  if (packageJson === null) return result;

  const diagnostics = [
    ...result.diagnostics,
    ...analyzePackageBunPolicy(packageJson, packageJsonPath, result),
    ...(await analyzeWorkflowBunPolicy(result)),
  ];

  return withDiagnostics(result, diagnostics);
}

/***
 * Reports package-manifest drift from the canonical Bun runtime contract.
 */
function analyzePackageBunPolicy(
  packageJson: Record<string, unknown>,
  packageJsonPath: string,
  result: DoctorAnalysisResult,
): DoctorDiagnostic[] {
  const diagnostics: DoctorDiagnostic[] = [];
  const { packageManager } = packageJson;
  if (isNonEmptyString(packageManager) && packageManager.startsWith('bun@')) {
    pushMismatch(diagnostics, {
      actual: packageManager,
      expected: BUN_POLICY.packageManager,
      location: 'package.json#packageManager',
      path: packageJsonPath,
      profile: result.profile,
      rule: REPOSITORY_POLICY.rules.packageManager,
    });
  }

  const devDependencies = isRecord(packageJson.devDependencies)
    ? packageJson.devDependencies
    : null;
  const bunTypes = devDependencies?.['@types/bun'];
  if (isNonEmptyString(bunTypes)) {
    pushMismatch(diagnostics, {
      actual: bunTypes,
      expected: BUN_POLICY.typesRange,
      location: 'package.json#devDependencies.@types/bun',
      path: packageJsonPath,
      profile: result.profile,
      rule: REPOSITORY_POLICY.rules.bunTypes,
    });
  }

  return diagnostics;
}

/***
 * Reports managed workflow drift from the canonical Bun setup version.
 */
async function analyzeWorkflowBunPolicy(result: DoctorAnalysisResult): Promise<DoctorDiagnostic[]> {
  const diagnostics = await Promise.all(
    BUN_POLICY.workflowTargets.map(async (workflow) => await analyzeWorkflow(result, workflow)),
  );
  return diagnostics.flat();
}

/***
 * Checks one managed workflow for the canonical Bun setup version.
 */
async function analyzeWorkflow(
  result: DoctorAnalysisResult,
  workflow: WorkflowTarget,
): Promise<DoctorDiagnostic[]> {
  const workflowPath = path.join(result.targetPath, workflow.path);
  const contents = await readTextOrNull(workflowPath);
  if (contents === null) {
    return [createWorkflowDiagnostic(result, workflow, workflowPath, 'missing-path')];
  }

  const match = BUN_VERSION_PATTERN.exec(contents);
  const actual = match?.[1];
  if (!isNonEmptyString(actual)) {
    return [createWorkflowDiagnostic(result, workflow, workflowPath, 'field-missing')];
  }

  const diagnostics: DoctorDiagnostic[] = [];
  pushMismatch(diagnostics, {
    actual,
    expected: BUN_POLICY.version,
    location: `${workflow.path}#bun-version`,
    path: workflowPath,
    profile: result.profile,
    rule: getRepositoryRule(workflow.ruleId),
  });
  return diagnostics;
}

/***
 * Creates a missing or malformed managed-workflow diagnostic from central rule metadata.
 */
function createWorkflowDiagnostic(
  result: DoctorAnalysisResult,
  workflow: WorkflowTarget,
  workflowPath: string,
  code: DoctorDiagnostic['code'],
): DoctorDiagnostic {
  const detail =
    code === 'missing-path'
      ? `Managed workflow is missing: ${workflow.path}.`
      : `${workflow.path} does not define bun-version.`;
  const rule = getRepositoryRule(workflow.ruleId);

  return {
    code,
    message: `${detail} Expected Bun ${BUN_POLICY.version}. ${REPAIR_HINT}`,
    path: workflowPath,
    profile: result.profile,
    ruleId: rule.id,
    severity: rule.severity,
  };
}

/***
 * Adds one value-mismatch diagnostic using the owning Policy rule metadata.
 */
function pushMismatch(
  diagnostics: DoctorDiagnostic[],
  input: {
    readonly actual: string;
    readonly expected: string;
    readonly location: string;
    readonly path: string;
    readonly profile: DoctorAnalysisResult['profile'];
    readonly rule: RepositoryPolicyRule;
  },
): void {
  if (input.actual === input.expected) return;

  diagnostics.push({
    code: 'field-invalid',
    message: `Bun policy drift at ${input.location}: expected "${input.expected}", found "${input.actual}". ${REPAIR_HINT}`,
    path: input.path,
    profile: input.profile,
    ruleId: input.rule.id,
    severity: input.rule.severity,
  });
}

/***
 * Resolves one stable repository rule by its Policy-owned id.
 */
function getRepositoryRule(ruleId: string): RepositoryPolicyRule {
  const rule = Object.values(REPOSITORY_POLICY.rules).find((entry) => entry.id === ruleId);
  if (rule === undefined) {
    throw new Error(`Unknown repository policy rule: ${ruleId}`);
  }
  return rule;
}

/***
 * Copies updated diagnostics into the analysis result and optional fix plan.
 */
function withDiagnostics(
  result: DoctorAnalysisResult,
  diagnostics: readonly DoctorDiagnostic[],
): DoctorAnalysisResult {
  return {
    ...result,
    diagnostics,
    fixPlan: result.fixPlan === null ? null : { ...result.fixPlan, diagnostics },
  };
}

/***
 * Reads a package manifest when it contains a JSON object.
 */
async function readPackageJson(packageJsonPath: string): Promise<Record<string, unknown> | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(packageJsonPath, 'utf8')) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/***
 * Reads a UTF-8 file while treating a missing managed path as absent.
 */
async function readTextOrNull(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return null;
    throw error;
  }
}

/***
 * Narrows unknown JSON data to a non-array record.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/***
 * Narrows a value to a non-empty string.
 */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/***
 * Narrows unknown failures to Node errors with stable error codes.
 */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
