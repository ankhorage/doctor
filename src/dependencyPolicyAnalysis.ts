import {
  analyzeDoctorTarget as analyzeBaseDoctorTarget,
  type DoctorAnalysisRequest,
  type DoctorAnalysisResult,
} from './analysis.js';
import { applyBunRuntimePolicy } from './bunPolicyAnalysis.js';
import { analyzeDoctorTargetWithCliLayout as analyzeBaseDoctorTargetWithCliLayout } from './cliLayoutAnalysis.js';
import { analyzeRepositoryMetadata } from './repositoryMetadataAnalysis.js';

/***
 * Analyze a Doctor target and apply repository-level dependency and runtime policies.
 */
export async function analyzeDoctorTarget(
  request: DoctorAnalysisRequest,
): Promise<DoctorAnalysisResult> {
  return applyRepositoryPolicies(await analyzeBaseDoctorTarget(request), request);
}

/***
 * Analyze a Doctor target with CLI layout validation and repository-level policies.
 */
export async function analyzeDoctorTargetWithCliLayout(
  request: DoctorAnalysisRequest,
): Promise<DoctorAnalysisResult> {
  return applyRepositoryPolicies(await analyzeBaseDoctorTargetWithCliLayout(request), request);
}

/***
 * Apply repository policies that remain independent from concrete package identities.
 */
async function applyRepositoryPolicies(
  result: DoctorAnalysisResult,
  request: DoctorAnalysisRequest,
): Promise<DoctorAnalysisResult> {
  const policyResult = await applyBunRuntimePolicy(result);
  return request.repositoryMetadata === undefined
    ? policyResult
    : analyzeRepositoryMetadata(policyResult, request);
}
