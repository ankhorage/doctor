import { promises as fs } from 'node:fs';
import path from 'node:path';

import { REPOSITORY_POLICY } from '@ankhorage/policy/repository';

import type { DoctorAnalysisResult } from './analysis.js';
import type { DoctorDiagnostic, DoctorRuleId } from './diagnostics.js';

const BUN_POLICY = REPOSITORY_POLICY.runtime.bun;
const REPAIR_HINT = 'Run "ankh devtools sync" to repair the managed Bun state.';
const BUN_VERSION_PATTERN = /^\s*bun-version:\s*['"]?([^'"\s#]+)['"]?\s*(?:#.*)?$/mu;

/***
 * Applies the canonical repository Bun policy to a public-package analysis.
 */
export async function applyBunRuntimePolicy(
  result: DoctorAnalysisResult,
): Promise<DoctorAnalysisResult> {
  if (result.profile !== 'public-package' || !result.hasPackageJson) {
    return result;
  }

  const packageJsonPath = path.join(result.targetPath, 'package.json');
  const packageJson = await readPackageJson(packageJsonPath);
  if (packageJson === null) {
    return result;
  }

  const diagnostics = [
    ...result.diagnostics,
    ...analyzePackageBunPolicy(packageJson, packageJsonPath, result),
    ...(await analyzeWorkflowBunPolicy(result)),
  ];

  return withDiagnostics(result, diagnostics);
}

/***
 * Reports Bun package metadata that differs from central repository policy.
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
 * Reports Bun workflow drift for every central managed workflow target.
 */
async function analyzeWorkflowBunPolicy(
  result: DoctorAnalysisResult,
): Promise<DoctorDiagnostic[]> {
  const diagnostics = await Promise.all(
    BUN_POLICY.workflowTargets.map(async (workflow) => await analyzeWorkflow(result, workflow)),
  );
  return diagnostics.flat();
}

/***
 * Validates one managed workflow Bun setup against central policy.
 */
async function analyzeWorkflow(
  result: DoctorAnalysisResult,
  workflow: (typeof BUN_POLICY.workflowTargets)[number],
): Promise<DoctorDiagnostic[]> {
  const workflowPath = path.join(result.targetPath, workflow.path);
  const contents = await readTextOrNull(workflowPath);
  const rule = getRepositoryRule(workflow.ruleId);
  if (contents === null) {
    return [createWorkflowDiagnostic(result, workflow.path, rule, workflowPath, 'missing-path')];
  }

  const match = BUN_VERSION_PATTERN.exec(contents);
  const actual = match?.[1];
  if (!isNonEmptyString(actual)) {
    return [createWorkflowDiagnostic(result, workflow.path, rule, workflowPath, 'field-missing')];
  }

  const diagnostics: DoctorDiagnostic[] = [];
  pushMismatch(diagnostics, {
    actual,
    expected: BUN_POLICY.version,
    location: `${workflow.path}#bun-version`,
    path: workflowPath,
    profile: result.profile,
    rule,
  });
  return diagnostics;
}

/***
 * Creates a missing-workflow or missing-field diagnostic from central rule metadata.
 */
function createWorkflowDiagnostic(
  result: DoctorAnalysisResult,
  relativePath: string,
  rule: RepositoryRule,
  workflowPath: string,
  code: DoctorDiagnostic['code'],
): DoctorDiagnostic {
  const detail =
    code === 'missing-path'
      ? `Managed workflow is missing: ${relativePath}.`
      : `${relativePath} does not define bun-version.`;
  return {
    code,
    message: `${detail} Expected Bun ${BUN_POLICY.version}. ${REPAIR_HINT}`,
    path: workflowPath,
    profile: result.profile,
    ruleId: rule.id,
    severity: rule.severity,
  };
}

interface MismatchInput {
  readonly actual: string;
  readonly expected: string;
  readonly location: string;
  readonly path: string;
  readonly profile: DoctorAnalysisResult['profile'];
  readonly rule: RepositoryRule;
}

/***
 * Appends one field-invalid diagnostic when actual policy state differs.
 */
function pushMismatch(diagnostics: DoctorDiagnostic[], input: MismatchInput): void {
  if (input.actual === input.expected) {
    return;
  }
  diagnostics.push({
    code: 'field-invalid',
    message: `Bun policy drift at ${input.location}: expected "${input.expected}", found "${input.actual}". ${REPAIR_HINT}`,
    path: input.path,
    profile: input.profile,
    ruleId: input.rule.id,
    severity: input.rule.severity,
  });
}

type RepositoryRule = {
  readonly id: Extract<
    DoctorRuleId,
    | 'package.json.package-manager.policy'
    | 'package.dependencies.types-bun.policy'
    | 'repo.workflows.ci.bun-policy'
    | 'repo.workflows.release.bun-policy'
  >;
  readonly severity: 'error';
};

/***
 * Resolves one central repository policy rule by its stable id.
 */
function getRepositoryRule(ruleId: DoctorRuleId): RepositoryRule {
  const rule = Object.values(REPOSITORY_POLICY.rules).find((candidate) => candidate.id === ruleId);
  if (rule === undefined) {
    throw new Error(`Unknown canonical repository policy rule: ${ruleId}`);
  }
  return rule;
}

/***
 * Adds diagnostics to the current analysis and its optional fix plan.
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
 * Reads a package manifest as a record when possible.
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
 * Reads a text file while treating a missing path as absent.
 */
async function readTextOrNull(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/***
 * Narrows a non-empty string from JSON-like input.
 */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

/***
 * Narrows a JSON-like value to a non-array record.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/***
 * Narrows an unknown error to a Node error carrying a code.
 */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
