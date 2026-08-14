export type {
  DoctorAnalysisRequest,
  DoctorAnalysisResult,
  DoctorFixPlan,
  DoctorPlannedChange,
  DoctorPlannedChangeKind,
  DoctorTargetCheck,
  DoctorTargetMode,
} from './analysis.js';
export {
  analyzeAuthReadiness,
  type DoctorAuthReadinessAnalysis,
} from './authReadinessAnalysis.js';
export { analyzeAuthReadinessFile } from './authReadinessFileAnalysis.js';
export {
  createDoctorRuntimeProvider,
  type CreateDoctorRuntimeProviderOptions,
} from './cli/index.js';
export { runCli } from './cli/standalone.js';
export type { DoctorCommandContext, DoctorCommandRunResult } from './commandContext.js';
export { createDefaultCommandContext } from './commandContext.js';
export {
  analyzeDoctorTarget,
  analyzeDoctorTargetWithCliLayout,
} from './dependencyPolicyAnalysis.js';
export type {
  DoctorDiagnostic,
  DoctorDiagnosticCode,
  DoctorDiagnosticSeverity,
  DoctorPolicyProfile,
  DoctorRuleId,
} from './diagnostics.js';
export {
  analyzeAppManifest,
  analyzeAppManifestFile,
  analyzeAppManifestTarget,
} from './manifestAnalysis.js';
export {
  DOCTOR_CAPABILITIES,
  DOCTOR_COMMAND_CATEGORY,
  DOCTOR_PACKAGE_METADATA,
  DOCTOR_PACKAGE_NAME,
  DOCTOR_PACKAGE_VERSION,
} from './packageMetadata.js';
export type { DoctorReadiness, DoctorReadinessStatus } from './readiness.js';
