import {
  analyzeDoctorTarget as analyzeBaseDoctorTarget,
  type DoctorAnalysisRequest,
  type DoctorAnalysisResult,
} from './analysis.js';
import { applyBunRuntimePolicy } from './bunPolicyAnalysis.js';
import { analyzeDoctorTargetWithCliLayout as analyzeBaseDoctorTargetWithCliLayout } from './cliLayoutAnalysis.js';

/***
 * Analyze a Doctor target and apply repository-level dependency and runtime policies.
 */
export async function analyzeDoctorTarget(
  request: DoctorAnalysisRequest,
): Promise<DoctorAnalysisResult> {
  return applyRepositoryPolicies(await analyzeBaseDoctorTarget(request));
}

/***
 * Analyze a Doctor target with CLI layout validation and repository-level policies.
 */
export async function analyzeDoctorTargetWithCliLayout(
  request: DoctorAnalysisRequest,
): Promise<DoctorAnalysisResult> {
  return applyRepositoryPolicies(await analyzeBaseDoctorTargetWithCliLayout(request));
}

/***
 * Apply repository policies that remain independent from concrete package identities.
 */
async function applyRepositoryPolicies(
  result: DoctorAnalysisResult,
): Promise<DoctorAnalysisResult> {
  return applyBunRuntimePolicy(result);
}
