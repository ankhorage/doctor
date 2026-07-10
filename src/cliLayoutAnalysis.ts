import { promises as fs } from 'node:fs';
import path from 'node:path';

import {
  analyzeDoctorTarget,
  type DoctorAnalysisRequest,
  type DoctorAnalysisResult,
} from './analysis.js';
import type { DoctorDiagnostic, DoctorPolicyProfile } from './diagnostics.js';

const LEGACY_ROOT_CLI_SOURCE = path.join('src', 'cli.ts');
const CANONICAL_CLI_INDEX_SOURCE = path.join('src', 'cli', 'index.ts');

export async function analyzeDoctorTargetWithCliLayout(
  request: DoctorAnalysisRequest,
): Promise<DoctorAnalysisResult> {
  const result = await analyzeDoctorTarget(request);
  if (!result.hasPackageJson) {
    return result;
  }

  const cliDiagnostics = await analyzeCliLayout(result.targetPath, result.profile);
  if (cliDiagnostics.length === 0) {
    return result;
  }

  const diagnostics = [...result.diagnostics, ...cliDiagnostics];

  return {
    ...result,
    diagnostics,
    fixPlan: result.fixPlan === null ? null : { ...result.fixPlan, diagnostics },
  };
}

async function analyzeCliLayout(
  targetPath: string,
  profile: DoctorPolicyProfile,
): Promise<DoctorDiagnostic[]> {
  const diagnostics: DoctorDiagnostic[] = [];
  const legacyRootCliPath = path.join(targetPath, LEGACY_ROOT_CLI_SOURCE);
  const canonicalCliIndexPath = path.join(targetPath, CANONICAL_CLI_INDEX_SOURCE);

  if (await pathExists(legacyRootCliPath)) {
    diagnostics.push({
      code: 'field-invalid',
      message: 'Package CLI code must live under src/cli/; root src/cli.ts is not allowed.',
      path: legacyRootCliPath,
      profile,
      ruleId: 'package.cli.root-file.disallowed',
      severity: 'error',
    });
  }

  const packageJson = await readPackageJson(path.join(targetPath, 'package.json'));
  if (
    packageJson !== null &&
    exposesCliProvider(packageJson) &&
    !(await pathExists(canonicalCliIndexPath))
  ) {
    diagnostics.push({
      code: 'missing-path',
      message: 'CLI-capable packages must expose their provider from src/cli/index.ts.',
      path: canonicalCliIndexPath,
      profile,
      ruleId: 'package.cli.index.required',
      severity: 'error',
    });
  }

  return diagnostics;
}

function exposesCliProvider(packageJson: Record<string, unknown>): boolean {
  const ankh = isRecord(packageJson.ankh) ? packageJson.ankh : null;
  const exportsField = isRecord(packageJson.exports) ? packageJson.exports : null;

  return isNonEmptyString(ankh?.provider) || exportsField?.['./cli'] !== undefined;
}

async function readPackageJson(packageJsonPath: string): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
