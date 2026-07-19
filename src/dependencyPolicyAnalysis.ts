import { promises as fs } from 'node:fs';
import path from 'node:path';

import {
  analyzeDoctorTarget as analyzeBaseDoctorTarget,
  type DoctorAnalysisRequest,
  type DoctorAnalysisResult,
} from './analysis.js';
import { analyzeDoctorTargetWithCliLayout as analyzeBaseDoctorTargetWithCliLayout } from './cliLayoutAnalysis.js';
import type { DoctorDiagnostic } from './diagnostics.js';

const ANKH_PACKAGE_NAME = '@ankhorage/ankh';
const DEVTOOLS_PACKAGE_NAME = '@ankhorage/devtools';
const DEVTOOLS_REQUIRED_RULE_ID = 'package.dependencies.devtools.required';

export async function analyzeDoctorTarget(
  request: DoctorAnalysisRequest,
): Promise<DoctorAnalysisResult> {
  return applyDevtoolsDependencyPlacementPolicy(await analyzeBaseDoctorTarget(request));
}

export async function analyzeDoctorTargetWithCliLayout(
  request: DoctorAnalysisRequest,
): Promise<DoctorAnalysisResult> {
  return applyDevtoolsDependencyPlacementPolicy(
    await analyzeBaseDoctorTargetWithCliLayout(request),
  );
}

async function applyDevtoolsDependencyPlacementPolicy(
  result: DoctorAnalysisResult,
): Promise<DoctorAnalysisResult> {
  if (!result.hasPackageJson) {
    return result;
  }

  const packageJsonPath = path.join(result.targetPath, 'package.json');
  const packageJson = await readPackageJson(packageJsonPath);
  if (packageJson?.name !== ANKH_PACKAGE_NAME || !expectsDevtools(packageJson)) {
    return result;
  }

  const dependencies = isRecord(packageJson.dependencies) ? packageJson.dependencies : null;
  const hasRuntimeDevtools = hasDependency(dependencies, DEVTOOLS_PACKAGE_NAME);
  const diagnosticsWithoutPlacementRule = result.diagnostics.filter(
    (diagnostic) => diagnostic.ruleId !== DEVTOOLS_REQUIRED_RULE_ID,
  );
  const diagnostics = hasRuntimeDevtools
    ? diagnosticsWithoutPlacementRule
    : [
        ...diagnosticsWithoutPlacementRule,
        createMissingRuntimeDevtoolsDiagnostic(packageJsonPath, result),
      ];

  return {
    ...result,
    diagnostics,
    fixPlan: result.fixPlan === null ? null : { ...result.fixPlan, diagnostics },
  };
}

async function readPackageJson(packageJsonPath: string): Promise<Record<string, unknown> | null> {
  try {
    const parsed = JSON.parse(await fs.readFile(packageJsonPath, 'utf8')) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function createMissingRuntimeDevtoolsDiagnostic(
  packageJsonPath: string,
  result: DoctorAnalysisResult,
): DoctorDiagnostic {
  return {
    code: 'missing-dependency',
    message:
      '@ankhorage/ankh bundles @ankhorage/devtools as a runtime core provider and must declare it in dependencies.',
    path: packageJsonPath,
    profile: result.profile,
    ruleId: DEVTOOLS_REQUIRED_RULE_ID,
    severity: 'error',
  };
}

function expectsDevtools(packageJson: Record<string, unknown>): boolean {
  const scripts = isRecord(packageJson.scripts) ? packageJson.scripts : null;
  if (scripts === null) {
    return false;
  }

  return Object.values(scripts).some(
    (scriptValue) =>
      isNonEmptyString(scriptValue) &&
      (scriptValue.includes('ankhorage-eslint') ||
        scriptValue.includes('ankhorage-prettier') ||
        scriptValue.includes('ankhorage-knip')),
  );
}

function hasDependency(
  dependencyMap: Record<string, unknown> | null,
  dependencyName: string,
): boolean {
  return dependencyMap !== null && isNonEmptyString(dependencyMap[dependencyName]);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
